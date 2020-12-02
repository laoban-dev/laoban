import {ShellResult} from "./shell";

export interface ConfigVariables {
    templateDir: string,
    log: string,
    status: string,
    scriptDir: string,
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
    commands: CommandDefn[]
}

export interface CommandContext {
    shellDebug: boolean,
    directories: string[]
}

export interface ScriptInContextAndDirectory {
    scriptInContext: ScriptInContext,
    directory: string
}
export interface ScriptInContext {
    config: Config,
    timestamp: Date,
    context: CommandContext,
    details: ScriptDetails
}

export interface DirectoryAndResults {
    directory: string
    results: ShellResult[]
}
export type ScriptProcessor = (sc: ScriptInContext) => Promise<DirectoryAndResults[]>


export interface Config extends ConfigVariables {
    directory: string
    laobanConfig: string
    variables: { [name: string]: string }
    scripts: ScriptDetails[]

}

export interface ScriptDefns {
    [name: string]: ScriptDefn

}
export interface ScriptDefn {
    description: string,
    guard?: string,
    commands: (string | CommandDefn)[],
}

export interface CommandDefn {
    name: string,
    command: string
    status?: boolean
}

export interface ProjectDetailsAndDirectory {
    directory: string
    projectDetails?: ProjectDetails
}
export interface ProjectDetails {
    "name": string,
    "description": string,
    "projectDetails": {
        "generation": 0,
        "publish": true
    }
}
