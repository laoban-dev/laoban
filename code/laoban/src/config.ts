import {ShellResult} from "./executors";
import {Writable} from "stream";
import {Status} from "./monitor";


export interface ConfigVariables {
    templateDir: string,
    versionFile: string,
    sessionDir: string,
    throttle?: number,
    log: string,
    status: string,
    profile: string,
    packageManager: string,
    variables?: { [name: string]: string }
}
export interface RawConfig extends ConfigVariables {
    scripts?: ScriptDefns,
    projectScripts?: ScriptDefns
}
export interface PackageJson {
    dependencies: { [key: string]: string }
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
    status: Status,
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
export type ScriptProcessor = (sc: ScriptInContext) => Promise<DirectoryAndResults[]>

export interface HasLaobanDirectory {
    laobanDirectory: string,
}
export interface HasOutputStream{
    outputStream: Writable
}

export type Action<T>= (config: Config, cmd: any)=> Promise<T>

export interface Config extends ConfigVariables, HasLaobanDirectory , HasOutputStream{
    laobanConfig: string,
    sessionDir: string,
    variables: { [name: string]: string },
    scripts: ScriptDetails[],
    os: string
}

export interface ScriptDefns {
    [name: string]: ScriptDefn

}
export interface Envs {
    [name: string]: string
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
export interface ConfigAndIssues extends HasOutputStream{
    config?: Config,
    issues: string[]
}

export type ConfigOrReportIssues = (c: ConfigAndIssues) => Promise<Config>
