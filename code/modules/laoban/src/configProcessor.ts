import { CommandDefn, Config, ConfigAndIssues, ConfigOrReportIssues, ConfigWithDebug, Envs, RawConfig, RawConfigAndIssues, ScriptDefn, ScriptDefns, ScriptDetails } from "./config";
import * as path from "path";
import { laobanFile, loabanConfigName } from "./Files";
import * as os from "os";
import fs from "fs";
// @ts-ignore
import { Validate } from "@phil-rice/validation";
import { validateLaobanJson } from "./validation";
import { Writable } from "stream";
import WritableStream = NodeJS.WritableStream;
import { output } from "./utils";


export function loadLoabanJsonAndValidate ( laobanDirectory: string ): RawConfigAndIssues {
  let laobanConfigFileName = laobanFile ( laobanDirectory );
  try {
    let rawConfig = JSON.parse ( fs.readFileSync ( laobanConfigFileName ).toString () )
    let issues = validateLaobanJson ( Validate.validate ( `In directory ${path.parse ( laobanDirectory ).name}, ${loabanConfigName}`, rawConfig ) ).errors;
    return { rawConfig, issues }
  } catch ( e ) {
    return { issues: [ `Could not load laoban.json` ] }
  }
}

export let abortWithReportIfAnyIssues: ConfigOrReportIssues = ( configAndIssues ) => {
  let issues = configAndIssues.issues
  let log = output ( configAndIssues )
  if ( issues.length > 0 ) {
    log ( 'Validation errors prevent loaban from running correctly' )
    issues.forEach ( e => log ( '  ' + e ) )
    process.exit ( 2 )
  } else return Promise.resolve ( { ...configAndIssues.config } )
}

export function loadConfigOrIssues ( outputStream: Writable, params: string[], fn: ( dir: string ) => RawConfigAndIssues ): ( laoban: string ) => ConfigAndIssues {
  return laoban => {
    let { rawConfig, issues } = fn ( laoban )
    return { issues, outputStream, config: issues.length > 0 ? undefined : configProcessor ( laoban, outputStream, rawConfig ), params };
  }
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
