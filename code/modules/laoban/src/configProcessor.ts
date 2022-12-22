import { combineRawConfigs, CommandDefn, Config, ConfigAndIssues, ConfigOrReportIssues, Envs, RawConfig, RawConfigAndIssues, ScriptDefn, ScriptDefns, ScriptDetails } from "./config";
import * as path from "path";
import { laobanFile, loabanConfigName } from "./Files";
import * as os from "os";
// @ts-ignore
import { Validate } from "@phil-rice/validation";
import { validateLaobanJson } from "./validation";
import { Writable } from "stream";
import { output } from "./utils";
import { cachedLoad, FileOps, toArray } from "@phil-rice/utils";
import WritableStream = NodeJS.WritableStream;

function findCache ( laobanDir, rawConfig, cacheDir: string ) {
  if ( rawConfig !== undefined ) return rawConfig
  if ( cacheDir !== undefined ) return path.join ( laobanDir, cacheDir )
  return path.join ( laobanDir, '.cache' )
}
const load = ( fileOps: FileOps, laobanDir: string, cacheDir: string | undefined, debug: boolean ) => async ( filename ): Promise<RawConfig> => {
  if ( debug ) console.log ( `About to try and load ${filename}` )
  const fileContent = await cachedLoad ( fileOps, cacheDir ) ( filename )
  if ( debug ) console.log ( `loaded fileContent from ${filename}`, fileContent )
  const rawConfig = JSON.parse ( fileContent )
  const ps = toArray ( rawConfig.parents );
  const actualCache = findCache ( laobanDir, rawConfig.cacheDir, cacheDir )
  if ( debug ) console.log ( `\nParents are`, ps )
  if ( ps.length === 0 ) return rawConfig
  const configs: RawConfig[] = await Promise.all ( ps.map ( load ( fileOps, laobanDir, actualCache, debug ) ) )
  return configs.reduce ( combineRawConfigs, rawConfig )
}

export const loadLoabanJsonAndValidate = ( files: FileOps, laobanDir: string,cacheDir: string | undefined, debug: boolean ) => async ( laobanDirectory: string ): Promise<RawConfigAndIssues> => {
  const laobanConfigFileName = laobanFile ( laobanDirectory );
  try {
    const rawConfig = await load ( files,laobanDir, cacheDir, debug ) ( laobanConfigFileName )
    const issues = Validate.validate ( `In directory ${path.parse ( laobanDirectory ).name}, ${loabanConfigName}`, rawConfig );
    return { rawConfig, issues: validateLaobanJson ( issues ).errors }
  } catch ( e ) {
    if ( debug ) console.error ( e )
    return { issues: [ `Could not load laoban.json. Run with --load.laoban.debug to find more` ] }
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

export function loadConfigOrIssues ( outputStream: Writable, params: string[], fn: ( dir: string ) => Promise<RawConfigAndIssues>, debug: boolean ): ( laoban: string ) => Promise<ConfigAndIssues> {
  return laoban =>
    fn ( laoban ).then ( ( { rawConfig, issues } ) => {
        if ( debug ) outputStream.write ( `rawConfig is\n${JSON.stringify ( rawConfig, null, 2 )}\nIssues are ${issues}\n` )
        const config = issues.length > 0 ? undefined : configProcessor ( laoban, outputStream, rawConfig );
        return { issues, outputStream, config, params };
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
    result[ name ] = derefence ( result, raw[ name ] )
  }
  add ( "templateDir", rawConfig )
  add ( "versionFile", rawConfig )
  add ( "log", rawConfig )
  add ( "status", rawConfig )
  add ( "profile", rawConfig )
  add ( "packageManager", rawConfig )
  result.sessionDir = rawConfig.sessionDir ? rawConfig.sessionDir : path.join ( laoban, '.session' )
  result.throttle = rawConfig.throttle ? rawConfig.throttle : 0
  for ( const k in rawConfig.variables ) add ( k, rawConfig.variables )
  result.scripts = addScripts ( result, rawConfig.scripts );
  result.os = os.type ()
  return result
}
