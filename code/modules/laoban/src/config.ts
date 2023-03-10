//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { Generations, ShellResult } from "./executors";
import { Writable } from "stream";
// @ts-ignore
import { Debug } from "@laoban/debug";
import { combineTwoObjects, NameAnd, safeArray, safeObject, unique } from "@laoban/utils";
import { FileOps, FileOpsAndXml } from "@laoban/fileops";


export interface ConfigVariables {
  templateDir: string;
  argsAfterMinus: string[];
  parents?: string | string[];
  templates: NameAnd<string>
  versionFile: string;
  version: string;
  sessionDir: string;
  cacheDir?: string
  throttle?: number;
  log: string;
  status: string;
  profile: string;
  packageManager: string;
  variables?: { [ name: string ]: string }
  properties?: NameAnd<string>
  defaultEnv?: NameAnd<string>
}
export interface RawConfig extends ConfigVariables {
  scripts?: ScriptDefns
}
export function combineRawConfigs ( r1: RawConfig, r2: RawConfig ): RawConfig {
  if ( r1 === undefined ) return r2;
  if ( r2 === undefined ) return r1;
  let result = {
    ...r1, ...r2,
    parents: unique ( [ ...safeArray ( r1.parents ), ...safeArray ( r2.parents ) ], url => url ),
    templates: combineTwoObjects ( r1.templates, r2.templates ),
    variables: combineTwoObjects ( r1.variables, r2.variables ),
    scripts: combineTwoObjects ( r1.scripts, r2.scripts ),
    properties: combineTwoObjects ( r1.properties, r2.properties )
  };
  // console.log ( 'combineRawConfigs', r1, r2, result )
  return result
}
export function combineRawConfigsAndFileOps ( r1: RawConfigAndFileOps, r2: RawConfigAndFileOps ): RawConfigAndFileOps {
  return { rawConfig: combineRawConfigs ( r1.rawConfig, r2.rawConfig ), fileOpsAndXml: r2.fileOpsAndXml }
}

export interface PackageJson {
  dependencies: { [ key: string ]: string }
}

export interface ScriptDetails {
  name: string,
  description: string,
  guard?: GuardDefn,
  osGuard?: string,
  pmGuard?: string,
  showShell?: boolean,
  noLogOverwrite?: boolean,
  guardReason?: string,
  inLinksOrder?: boolean,
  env?: Envs,
  commands: CommandDefn[]
}

export interface CommandContext {
  shellDebug: boolean,
  directories: PackageDetailsAndDirectory[]
}

export interface ScriptInContextAndDirectoryWithoutStream {
  scriptInContext: ScriptInContext,
  detailsAndDirectory: PackageDetailsAndDirectory

}
export interface ScriptInContextAndDirectory extends ScriptInContextAndDirectoryWithoutStream {
  logStreams: Writable
}


export interface ScriptInContext {
  ignoreGuard?: boolean
  dirWidth: number,
  debug: Debug,
  dryrun: boolean,
  shell: boolean,
  genPlan: boolean,
  links: boolean,
  throttle: number,
  quiet: boolean,
  variables: boolean,
  config: Config,
  timestamp: Date,
  context: CommandContext,
  details: ScriptDetails,
  sessionId: string
}

export interface DirectoryAndResults {
  detailsAndDirectory: PackageDetailsAndDirectory
  results: ShellResult[]
}
export type ScriptProcessor = ( sc: ScriptInContext ) => Promise<DirectoryAndResults[]>

export interface HasLaobanDirectory {
  laobanDirectory: string,
}

export interface HasOutputStream {
  outputStream: Writable
}

export type Action<T> = ( fileOps: FileOps, config: ConfigWithDebug, cmd: any ) => Promise<T>
export type PackageAction<T> = ( config: ConfigWithDebug, cmd: any, pds: PackageDetailsAndDirectory[] ) => Promise<T>
export type ScriptAction<T> = ( config: ConfigWithDebug, cmd: any, generations: Generations ) => Promise<T>

export interface Config extends ConfigVariables, HasLaobanDirectory, HasOutputStream {
  laobanConfig: string,
  sessionDir: string,
  variables: { [ name: string ]: string },
  scripts: ScriptDetails[],
  os: string
  inits?: string

}

export function combineConfigs ( c1: Config | undefined, c2: Config | undefined ): Config | undefined {
  if ( c1 === undefined ) return c2
  if ( c2 === undefined ) return c1
  return {
    ...c1, ...c2,
    variables: { ...c1.variables, ...c2.variables },
    scripts: [ ...c1.scripts, ...c2.scripts ],
    templates: { ...safeObject ( c1.templates ), ...safeObject ( c2.templates ) }
  }
}

export interface ConfigWithDebug extends Config {
  debug: Debug
}
export interface ScriptDefns {
  [ name: string ]: ScriptDefn

}
export interface Envs {
  [ name: string ]: string
}
export interface FullGuard {
  value: string;
  default?: string;
  equals?: string;
}
export type GuardDefn = string | FullGuard
export function isFullGuard ( g: GuardDefn ): g is FullGuard {
  return typeof g === 'object'
}

export const guardFrom = ( g: GuardDefn | undefined ): string | undefined => {
  return isFullGuard ( g ) ? g.value || g.default : g;
};

export interface ScriptDefn {
  description: string,
  guard?: GuardDefn,
  inLinksOrder?: boolean,
  showShell?: boolean,
  noLogOverwrite?: boolean,
  commands: (string | CommandDefn)[],
  env?: Envs
}

export function scriptHasGuard ( script: ScriptDefn ): boolean {
  return script.guard !== undefined || script.commands.reduce ( ( acc, c ) => hasGuard ( c ) || acc, false )
}

export interface CommandDefn {
  name?: string,
  command: string,
  status?: boolean,
  eachLink?: boolean,
  guard?: GuardDefn,
  directory?: string
}
function hasGuard ( command: CommandDefn | string ): boolean {
  return typeof command !== 'string' && command.guard !== undefined
}

export interface PackageDetailsAndDirectory {
  directory: string
  packageDetails?: PackageDetails
  errorParsing?: boolean
}
export interface PackageDetailsDirectoryPropertiesAndVersion {
  version: string
  directory: string
  packageDetails?: PackageDetails
  properties: NameAnd<string>
}

export interface Guards {
  "publish": boolean,
}
export interface PackageDetails {
  "name": string,
  "description": string,
  template: string,
  "guards": Guards
  links: string[]
}
export interface RawConfigAndFileOps {
  rawConfig?: RawConfig,
  fileOpsAndXml: FileOpsAndXml
}

export interface RawConfigAndFileOpsAndIssues extends RawConfigAndFileOps {
  issues: string[]
}
export interface ConfigAndIssues extends HasOutputStream {
  config?: Config,
  fileOpsAndXml: FileOpsAndXml
  params: string[]
  issues: string[]
}

export type ConfigOrReportIssues = ( c: ConfigAndIssues ) => Promise<Config>
