import { combineRawConfigsAndFileOps, CommandDefn, Config, ConfigAndIssues, ConfigOrReportIssues, Envs, RawConfig, RawConfigAndFileOps, RawConfigAndFileOpsAndIssues, ScriptDefn, ScriptDefns, ScriptDetails } from "./config";
import * as path from "path";
import { laobanFile, loabanConfigName } from "./Files";
import * as os from "os";
// @ts-ignore
import { Validate } from "@phil-rice/validation";
import { validateLaobanJson } from "./validation";
import { Writable } from "stream";
import { output } from "./utils";
import { CachedFileOps, cachedFileOps, FileOps, fileOpsStats, isCachedFileOps, meteredFileOps, toArray } from "@phil-rice/utils";
import WritableStream = NodeJS.WritableStream;

export function findCache ( laobanDir, rawConfig, cacheDir: string ) {
  if ( rawConfig !== undefined ) return rawConfig
  if ( cacheDir !== undefined ) return path.join ( laobanDir, cacheDir )
  return path.join ( laobanDir, '.cache' )
}
export type MakeCacheFn = ( rawConfig: RawConfigAndFileOps ) => Promise<FileOps>
export type MakeCacheFnFromLaobanDir = ( laobanDir: string ) => MakeCacheFn

export const makeCache = ( laobanDir: string ) => ( { rawConfig, fileOps }: RawConfigAndFileOps ): Promise<FileOps> => {
  const actualCache = findCache ( laobanDir, rawConfig.cacheDir, undefined )
  return Promise.resolve ( cachedFileOps ( meteredFileOps ( fileOps ), actualCache ) )
};

export const makeAndClearCache = ( laobanDir: string ) => async ( rcf: RawConfigAndFileOps ): Promise<FileOps> => {
  const { rawConfig, fileOps } = rcf
  let newFileOps = await makeCache ( laobanDir ) ( rcf );
  const actualCache = isCachedFileOps ( newFileOps ) ? newFileOps.cacheDir : undefined
  if ( actualCache === undefined ) return Promise.resolve ( newFileOps )
  return newFileOps.removeDirectory ( actualCache, true ).then ( () => newFileOps.createDir ( actualCache ).then ( () => newFileOps ) )
}
const load = ( fileOps: FileOps, makeCache: MakeCacheFn, debug: boolean ) => {
  return async ( filename ): Promise<RawConfigAndFileOps> => {
    if ( debug ) console.log ( `About to try and load ${filename}`, fileOpsStats ( fileOps ) )
    const fileContent = await fileOps.loadFileOrUrl ( filename )
    if ( debug ) console.log ( `loaded fileContent from ${filename}`, fileContent )
    const rawConfig: RawConfig = JSON.parse ( fileContent )
    // console.log ( `load ${filename}`, rawConfig.templates )
    const ps = toArray ( rawConfig.parents );
    if ( debug ) console.log ( `\nParents are`, ps )
    const withCache = await makeCache ( { rawConfig, fileOps } );
    if ( ps.length === 0 ) return { rawConfig, fileOps: withCache }
    const configs: RawConfigAndFileOps[] = await Promise.all ( ps.map ( load ( withCache, makeCache, debug ) ) )
    const result: RawConfigAndFileOps = { ...configs.reduce ( combineRawConfigsAndFileOps, { rawConfig, fileOps: withCache } ) };
    return result
  };
}

export const loadLoabanJsonAndValidate = ( files: FileOps, makeCache: MakeCacheFn, debug: boolean ) => async ( laobanDirectory: string ): Promise<RawConfigAndFileOpsAndIssues> => {
  const laobanConfigFileName = laobanFile ( laobanDirectory );
  try {
    const { rawConfig, fileOps } = await load ( files, makeCache, debug ) ( laobanConfigFileName )
    const issues = Validate.validate ( `In directory ${path.parse ( laobanDirectory ).name}, ${loabanConfigName}`, rawConfig );
    return { rawConfig, issues: validateLaobanJson ( issues ).errors, fileOps }
  } catch ( e ) {
    if ( debug ) console.error ( e )
    return { issues: [ `Could not load laoban.json. Run with --load.laoban.debug to find more` ], fileOps: files }
  }
}

export let abortWithReportIfAnyIssues: ConfigOrReportIssues = ( configAndIssues ) => {
  let issues = configAndIssues.issues
  let log = output ( configAndIssues )
  if ( issues.length > 0 ) {
    log ( 'Validation errors prevent laoban from running correctly' )
    issues.forEach ( e => log ( '  ' + e ) )
    process.exit ( 2 )
  } else return Promise.resolve ( { ...configAndIssues.config } )
}

export function loadConfigOrIssues ( outputStream: Writable, params: string[], fn: ( dir: string ) => Promise<RawConfigAndFileOpsAndIssues>, debug: boolean ): ( laoban: string ) => Promise<ConfigAndIssues> {
  return laoban =>
    fn ( laoban ).then ( ( { rawConfig, issues, fileOps } ) => {
        if ( debug ) outputStream.write ( `rawConfig is\n${JSON.stringify ( rawConfig, null, 2 )}\nIssues are ${issues}\n` )
        const config = issues.length > 0 ? undefined : configProcessor ( laoban, outputStream, rawConfig );
        return { issues, outputStream, config, params, fileOps };
      }
    )
}


/** ref is like ${xxx} and this returns dic[xxx]. If the variable doesn't exist it is left alone... */
function replaceVar ( dic: any, ref: string ): string {
  if ( ref === undefined ) return undefined
  let i = ref.slice ( 2, ref.length - 1 );
  let parts = i.split ( '.' )
  try {
    let result = parts.reduce ( ( acc, part ) => acc[ part ], dic )
    return result !== undefined ? result : ref
  } catch ( e ) {return ref}
}
/** If the string has ${a} in it, then that is replaced by the dic entry */
export function derefence ( dic: any, s: string ) {
  const regex = /(\$\{[^}]*\})/g
  let groups = s.match ( regex )
  return groups ? groups.reduce ( ( acc, v ) => acc.replace ( v, replaceVar ( dic, v ) ), s ) : s;
}

export function replaceVarToUndefined ( dic: any, ref: string ): string | undefined {
  if ( ref === undefined ) return undefined
  let i = ref.slice ( 2, ref.length - 1 );
  let parts = i.split ( '.' )
  try {
    return parts.reduce ( ( acc, part ) => acc[ part ], dic )
  } catch ( e ) {return undefined}
}
export function derefenceToUndefined ( dic: any, s: string ) {
  const regex = /(\$\{[^}]*\})/g
  let groups = s.match ( regex )
  if ( groups ) {
    return groups.reduce ( ( acc, v ) => {
      let repl = replaceVarToUndefined ( dic, v )
      return acc.replace ( v, repl ? repl : "" )
    }, s )
  }
  return undefined
}


function isCommand ( x: (string | CommandDefn) ): x is CommandDefn {
  return typeof x === 'object'
}
export function cleanUpCommand ( command: (string | CommandDefn) ): CommandDefn {
  return isCommand ( command ) ?
    ({ ...command, command: command.command }) :
    ({ name: '', command: command })
}
export function cleanUpEnv ( dic: any, env: Envs ): Envs {
  if ( env ) {
    let result: Envs = {}
    Object.keys ( env ).forEach ( key => result[ key ] = derefence ( dic, env[ key ].toString () ) )
    return result
  }
  return env
}
function cleanUpScript ( dic: any ): ( scriptName: string, defn: ScriptDefn ) => ScriptDetails {
  return ( scriptName, defn ) => ({
    name: derefence ( dic, scriptName ),
    description: derefence ( dic, defn.description ),
    guard: defn.guard,
    osGuard: defn.osGuard,
    pmGuard: defn.pmGuard,
    guardReason: defn.guardReason,
    inLinksOrder: defn.inLinksOrder,
    commands: defn.commands.map ( cleanUpCommand ),
    env: cleanUpEnv ( dic, defn.env )
  })
}
function addScripts ( dic: any, scripts: ScriptDefns ) {
  var result: ScriptDetails[] = []
  for ( const scriptName in scripts )
    result.push ( cleanUpScript ( dic ) ( scriptName, scripts[ scriptName ] ) )
  return result;
}
export function configProcessor ( laoban: string, outputStream: WritableStream, rawConfig: RawConfig ): Config {
  var result: any = { laobanDirectory: laoban, outputStream, laobanConfig: path.join ( laoban, loabanConfigName ) }
  function add ( name: string, raw: any ) {
    try {
      result[ name ] = derefence ( result, raw[ name ] )
    } catch ( e ) {
      console.error ( e );
      throw Error ( `Failed to add ${name} to config. Error is ${e}` )
    }
  }
  add ( "templateDir", rawConfig )
  add ( "versionFile", rawConfig )
  add ( "log", rawConfig )
  add ( "status", rawConfig )
  add ( "cacheDir", { ...rawConfig, cacheDir: findCache ( laoban, undefined, rawConfig.cacheDir ) } )
  add ( "profile", rawConfig )
  add ( "packageManager", rawConfig )
  result.templates = rawConfig.templates ? rawConfig.templates : {}
  result.sessionDir = rawConfig.sessionDir ? rawConfig.sessionDir : path.join ( laoban, '.session' )
  result.throttle = rawConfig.throttle ? rawConfig.throttle : 0
  for ( const k in rawConfig.variables ) add ( k, rawConfig.variables )
  result.scripts = addScripts ( result, rawConfig.scripts );
  result.os = os.type ()
  return result
}
