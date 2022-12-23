import { Generations, ShellResult } from "./executors";
import { Writable } from "stream";
// @ts-ignore
import { Debug } from "@phil-rice/debug";
import { combineTwoObjects, NameAnd, safeArray, safeObject } from "@phil-rice/utils";


export interface ConfigVariables {
  templateDir: string;
  parents?: string|string[];
  templates: NameAnd<string>
  versionFile: string;
  sessionDir: string;
  cacheDir?: string
  throttle?: number;
  log: string;
  status: string;
  profile: string;
  packageManager: string;
  parent?: string | string[];
  variables?: { [ name: string ]: string }
}
export interface RawConfig extends ConfigVariables {
  scripts?: ScriptDefns
}
export function combineRawConfigs ( r1: RawConfig, r2: RawConfig ): RawConfig {
  return {
    ...r1, ...r2,
    parent: [ ...safeArray ( r1.parent ), ...safeArray ( r2.parent ) ],
    templates: combineTwoObjects(r1.templates, r2.templates),
    variables: combineTwoObjects ( r1.variables, r2.variables ),
    scripts: combineTwoObjects ( r1.scripts, r2.scripts )
  }
}

export interface PackageJson {
  dependencies: { [ key: string ]: string }
}

export interface ScriptDetails {
  name: string,
  description: string,
  guard?: string,
  osGuard?: string,
  pmGuard?: string,
  guardReason?: string,
  inLinksOrder?: boolean,
  env?: Envs,
  commands: CommandDefn[]
}

export interface CommandContext {
  shellDebug: boolean,
  directories: ProjectDetailsAndDirectory[]
}

export interface ScriptInContextAndDirectoryWithoutStream {
  scriptInContext: ScriptInContext,
  detailsAndDirectory: ProjectDetailsAndDirectory
}
export interface ScriptInContextAndDirectory extends ScriptInContextAndDirectoryWithoutStream {
  logStream: Writable
  streams: Writable[]
}


export interface ScriptInContext {
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
  detailsAndDirectory: ProjectDetailsAndDirectory
  results: ShellResult[]
}
export type ScriptProcessor = ( sc: ScriptInContext ) => Promise<DirectoryAndResults[]>

export interface HasLaobanDirectory {
  laobanDirectory: string,
}

export interface HasOutputStream {
  outputStream: Writable
}

export type Action<T> = ( config: ConfigWithDebug, cmd: any ) => Promise<T>
export type ProjectAction<T> = ( config: ConfigWithDebug, cmd: any, pds: ProjectDetailsAndDirectory[] ) => Promise<T>
export type ScriptAction<T> = ( config: ConfigWithDebug, cmd: any, generations: Generations ) => Promise<T>

export interface Config extends ConfigVariables, HasLaobanDirectory, HasOutputStream {
  laobanConfig: string,
  sessionDir: string,
  variables: { [ name: string ]: string },
  scripts: ScriptDetails[],
  os: string
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
export interface ScriptDefn {
  description: string,
  guard?: string,
  osGuard?: string,
  pmGuard?: string,
  guardReason?: string,
  inLinksOrder?: boolean,
  commands: (string | CommandDefn)[],
  env?: Envs
}

export interface CommandDefn {
  name?: string,
  command: string,
  status?: boolean,
  eachLink?: boolean,
  osGuard?: string,
  pmGuard?: string,
  directory?: string
}

export interface ProjectDetailsAndDirectory {
  directory: string
  projectDetails?: ProjectDetails
}
export interface Details {
  "publish": boolean,
  "links": string[],
  "extraDeps": any,
  "extraDevDeps": any,
  extraBins: any
}
export interface ProjectDetails {
  "name": string,
  "description": string,
  template: string,
  "details": Details
}


export interface RawConfigAndIssues {
  rawConfig?: RawConfig,
  issues: string[]
}
export interface ConfigAndIssues extends HasOutputStream {
  config?: Config,
  params: string[]
  issues: string[]
}

export type ConfigOrReportIssues = ( c: ConfigAndIssues ) => Promise<Config>
