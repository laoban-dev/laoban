//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { combineRawConfigsAndFileOps, CommandDefn, Config, ConfigAndIssues, ConfigOrReportIssues, Envs, RawConfig, RawConfigAndFileOps, RawConfigAndFileOpsAndIssues, ScriptDefn, ScriptDefns, ScriptDetails } from "@laoban/config";

import { findLaoban, laobanFile, loabanConfigName } from "./Files";
import * as os from "os";
import { Validate } from "@laoban/validation";
import { validateLaobanJson } from "./validation";
import { Writable } from "stream";
import { output } from "./utils";
import { derefence, dollarsBracesVarDefn } from "@laoban/variables";
import { cachedFileOps, fileNameWithoutShortCuts, FileOps, FileOpsAndXml, fileOpsStats, inDirectoryFileOps, meteredFileOps, parseJson, Path, shortCutFileOps, shortCuts } from "@laoban/fileops";
import { lastSegment, toArray } from "@laoban/utils";
import WritableStream = NodeJS.WritableStream;

// const path = simplePath
export function findCache ( path: Path, laobanDir, rawConfig, cacheDir: string ) {
  if ( rawConfig !== undefined ) return rawConfig
  if ( cacheDir !== undefined ) return path.join ( laobanDir, cacheDir )
  return path.join ( laobanDir, '.cache' )
}
export type MakeCacheFn = ( rawConfig: RawConfigAndFileOps ) => FileOps
export type MakeCacheFnFromLaobanDir = ( laobanDir: string ) => MakeCacheFn

export const makeCache = ( laobanDir: string ) => ( { rawConfig, fileOpsAndXml }: RawConfigAndFileOps ): FileOps => {
  const fileOps = fileOpsAndXml.fileOps
  const actualCache = findCache ( fileOps, laobanDir, rawConfig.cacheDir, undefined )
  return shortCutFileOps ( inDirectoryFileOps ( cachedFileOps ( meteredFileOps ( fileOps ), actualCache ), laobanDir ), shortCuts )
};

const load = ( fileOpsAndXml: FileOpsAndXml, makeCache: MakeCacheFn, debug: boolean ) => {
  const fileOps = fileOpsAndXml.fileOps
  return async ( filename ): Promise<RawConfigAndFileOps> => {
    if ( debug ) console.log ( `About to try and load ${filename}`, fileOpsStats ( fileOps ) )
    const fileContent = await fileOps.loadFileOrUrl ( filename )
    if ( debug ) console.log ( `loaded fileContent from ${filename}`, fileContent )
    const rawConfig = parseJson<any> ( () => `${fileNameWithoutShortCuts ( fileOps, filename )} as part of loading ${loabanConfigName}`, true ) ( fileContent )
    // console.log ( `load ${filename}`, rawConfig.templates )
    const ps = toArray ( rawConfig.parents );
    if ( debug ) console.log ( `\nParents are`, ps )
    const withCache = makeCache ( { rawConfig, fileOpsAndXml } );
    const fileOpsAndXmlWithCache = { ...fileOpsAndXml, fileOps: withCache };
    let rawResult = { rawConfig, fileOpsAndXml: fileOpsAndXmlWithCache };
    if ( ps.length === 0 ) return rawResult
    const configs: RawConfigAndFileOps[] = await Promise.all ( ps.map ( load ( fileOpsAndXmlWithCache, makeCache, debug ) ) )
    const result: RawConfigAndFileOps = { ...[ ...configs, rawResult ].reduce ( combineRawConfigsAndFileOps ) };
    return result
  };
}

async function getVersionOrUndefined ( rawConfig: RawConfig, fileOps: FileOps, versionUrl: string ): Promise<string | undefined> {
  try {return rawConfig.versionFile ? await fileOps.loadFileOrUrl ( versionUrl ) : undefined;} catch ( e ) {return undefined;}
}
export const loadLoabanJsonAndValidate = ( origFileOpsAndXml: FileOpsAndXml, makeCache: MakeCacheFn, debug: boolean ) => async ( laobanDirectory: string ): Promise<RawConfigAndFileOpsAndIssues> => {
  const laobanConfigFileName = laobanFile ( laobanDirectory );
  try {
    const { rawConfig, fileOpsAndXml } = await load ( origFileOpsAndXml, makeCache, debug ) ( laobanConfigFileName )
    const issues = Validate.validate ( `In directory ${lastSegment ( laobanDirectory )}, ${loabanConfigName}`, rawConfig );
    const versionUrl = derefence ( `loading version`, { ...rawConfig, laobanDirectory }, rawConfig.versionFile, { variableDefn: dollarsBracesVarDefn } );
    const version = await getVersionOrUndefined ( rawConfig, fileOpsAndXml.fileOps, versionUrl )
    return { rawConfig: { ...rawConfig, version }, issues: validateLaobanJson ( issues ).errors, fileOpsAndXml }
  } catch ( e ) {
    if ( debug ) console.error ( e )
    return { issues: [ `Could not load laoban.json. Run with --load.laoban.debug to find more` ], fileOpsAndXml: origFileOpsAndXml }
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

export function loadConfigOrIssues ( path: Path, outputStream: Writable, params: string[], fn: ( dir: string ) => Promise<RawConfigAndFileOpsAndIssues>, debug: boolean ): ( laoban: string ) => Promise<ConfigAndIssues> {
  return laoban =>
    fn ( laoban ).then ( ( { rawConfig, issues, fileOpsAndXml } ) => {
        // console.log('loadConfigOrIssues = args', argsAfterMinus, 'process.argv', process.argv)
        if ( debug ) outputStream.write ( `rawConfig is\n${JSON.stringify ( rawConfig, null, 2 )}\nIssues are ${issues}` )
        const config = issues.length > 0 ? undefined : configProcessor ( path, laoban, outputStream, rawConfig );
        return { issues, outputStream, config, params, fileOpsAndXml: fileOpsAndXml };
      }
    )
}


function isCommand ( x: (string | CommandDefn) ): x is CommandDefn {
  return typeof x === 'object'
}
export function cleanUpCommand ( command: (string | CommandDefn) ): CommandDefn {
  return isCommand ( command ) ?
    ({ ...command, command: command.command }) :
    ({ name: '', command: command })
}
export function cleanUpEnv ( context: string, dic: any, env: Envs ): Envs {
  if ( env ) {
    let result: Envs = {}
    const realContext = context + `${JSON.stringify ( env )}`
    Object.keys ( env ).forEach ( key => result[ key ] = derefence ( context + '.' + key, dic, env[ key ].toString (), { variableDefn: dollarsBracesVarDefn } ) )
    return result
  }
  return env
}
function cleanUpScript ( dic: any ): ( scriptName: string, defn: ScriptDefn ) => ScriptDetails {
  return ( scriptName, defn ) => ({
    name: derefence ( `cleanUpScript ${scriptName}.name`, dic, scriptName, { throwError: true, variableDefn: dollarsBracesVarDefn } ),
    description: derefence ( `cleanUpScript ${scriptName}.description`, dic, defn.description, { throwError: true, variableDefn: dollarsBracesVarDefn } ),
    guard: defn.guard,
    passThruArgs: defn.passThruArgs,
    showShell: defn.showShell,
    noLogOverwrite: defn.noLogOverwrite,
    inLinksOrder: defn.inLinksOrder,
    commands: defn.commands.map ( cleanUpCommand ),
    env: cleanUpEnv ( `cleanUpScript ${scriptName}.env`, dic, defn.env )
  })
}
function addScripts ( dic: any, scripts: ScriptDefns ) {
  var result: ScriptDetails[] = []
  for ( const scriptName in scripts )
    result.push ( cleanUpScript ( dic ) ( scriptName, scripts[ scriptName ] ) )
  return result;
}
export function configProcessor ( path: Path, laoban: string, outputStream: WritableStream, rawConfig: RawConfig ): Config {
  var result: any = { laobanDirectory: laoban, outputStream, laobanConfig: path.join ( laoban, loabanConfigName ) }
  function add ( name: string, raw: any, defaultvalue?: string ) {
    try {
      const value = raw[ name ] ? raw[ name ] : defaultvalue
      result[ name ] = derefence ( `processing config ${name}`, result, value, { throwError: true, variableDefn: dollarsBracesVarDefn } )
    } catch ( e ) {
      console.error ( e );
      throw Error ( `Failed to add ${name} to config. Error is ${e}` )
    }
  }
  add ( "version", rawConfig )
  add ( "versionFile", rawConfig )
  add ( "log", rawConfig )
  add ( "status", rawConfig )
  add ( "inits", rawConfig, "@laoban@/init/allInits.json" )
  add ( "cacheDir", { ...rawConfig, cacheDir: findCache ( path, laoban, undefined, rawConfig.cacheDir ) } )
  add ( "profile", rawConfig )
  add ( "packageManager", rawConfig )
  if ( rawConfig.templateDir ) add ( "templateDir", rawConfig );
  result.properties = rawConfig.properties ? rawConfig.properties : {}
  result.defaultEnv = rawConfig.defaultEnv
  result.templates = rawConfig.templates ? rawConfig.templates : {}
  result.sessionDir = rawConfig.sessionDir ? rawConfig.sessionDir : path.join ( laoban, '.session' )
  result.throttle = rawConfig.throttle ? rawConfig.throttle : 0
  // result.variables = rawConfig.variables
  for ( const k in rawConfig.variables ) add ( k, rawConfig.variables )
  result.scripts = addScripts ( result, rawConfig.scripts );
  result.os = os.type ()
  if ( rawConfig.defaultEnv ) {
    result.defaultEnv = {}
    Object.entries ( rawConfig.defaultEnv ).forEach ( ( [ k, v ] ) => {
      result.defaultEnv[ k ] = v;
      if ( process.env[ k ] === undefined ) process.env[ k ] = v;
    } )
  }
  return result
}
export const loadLaobanAndIssues = ( fileOpsAndXml: FileOpsAndXml, makeCacheFn: MakeCacheFnFromLaobanDir ) => async ( dir: string, params: string[], outputStream: Writable ): Promise<ConfigAndIssues> => {
  try {
    const debug = params.includes ( '--load.laoban.debug' )
    const laoban = findLaoban ( process.cwd () )
    if ( debug ) console.log ( `Found laoban.json at ${laoban}\n` )
    const fileOps = fileOpsAndXml.fileOps;
    return loadConfigOrIssues ( fileOps, outputStream, params, loadLoabanJsonAndValidate ( fileOpsAndXml, makeCacheFn ( laoban ), debug ), debug ) ( laoban );
  } catch ( e ) {
    return {
      outputStream,
      params,
      fileOpsAndXml,
      issues: [ `Error while starting  ${e.message}` ]
    }
  }

};
