import {ShellResult} from "./shell";

export interface ConfigVariables {
    templateDir: string,
    versionFile: string,
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

export interface ScriptDetails {
    name: string,
    description: string,
    guard?: string,
    osGuard?: string,
    pmGuard?: string,
    guardReason?: string,
    env?: Envs,
    commands: CommandDefn[]
}

export interface CommandContext {
    shellDebug: boolean,
    directories: ProjectDetailsAndDirectory[]
}

export interface ScriptInContextAndDirectory {
    scriptInContext: ScriptInContext,
    detailsAndDirectory: ProjectDetailsAndDirectory
}
export interface ScriptInContext {
    dryrun: boolean,
    variables: boolean,
    config: Config,
    timestamp: Date,
    context: CommandContext,
    details: ScriptDetails
}

export interface DirectoryAndResults {
    detailsAndDirectory: ProjectDetailsAndDirectory
    results: ShellResult[]
}
export type ScriptProcessor = (sc: ScriptInContext) => Promise<DirectoryAndResults[]>


export interface Config extends ConfigVariables {
    laobanDirectory: string
    laobanConfig: string
    variables: { [name: string]: string }
    scripts: ScriptDetails[]

}

export interface ScriptDefns {
    [name: string]: ScriptDefn

}
export interface Envs{
    [name: string]: string
}
export interface ScriptDefn {
    description: string,
    guard?: string,
    osGuard?:string,
    pmGuard?: string,
    guardReason?: string,
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
export interface ProjectDetails {
    "name": string,
    "description": string,
    template: string,
    "projectDetails": {
        "generation": number,
        "publish": boolean,
        "links": string[],
        "extraDeps": any,
        "extraDevDeps": any,
        extraBins: any
    }
}
