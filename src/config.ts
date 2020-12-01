import {ShellResult} from "./shell";

export interface ConfigVariables {
    templateDir: string,
    globalLog: string,
    projectLog: string,
    scriptDir: string,
    packageManager: string,
    variables?: { [name: string]: string }
}
export interface RawConfig extends ConfigVariables {
    scripts?: ScriptDefns,
    projectScripts?: ScriptDefns
}

export interface ScriptDetails {
    name: string
    description: string
    commands: Command[]
    type: ScriptProcessor
}
export type ScriptProcessor = 'global' | 'project'

export interface CommandContext {
    shellDebug: boolean,
    all?: boolean
}
export type ScriptProcessorMap = Map<ScriptProcessor, (context: CommandContext, c: Config, s: ScriptDetails) => Promise<ShellResult[]>>

export interface Config extends ConfigVariables {
    directory: string
    laobanConfig: string
    variables: { [name: string]: string }
    globalScripts: ScriptDetails[]
    projectScripts: ScriptDetails[]
}
export interface ScriptDefns {
    [name: string]: ScriptDefn

}
export interface ScriptDefn {
    description: string,
    commands: (string | Command)[],
}

export interface Command {
    name: string,
    command: string
    status?: boolean
}


let example: RawConfig = {
    "templateDir": "template",
    "globalLog": "laoban/log",
    "projectLog": "log",
    "scriptDir": "laobanScripts",
    "packageManager": "npm",
    "scripts": {
        "log": {"description": "displays the global log file", "commands": ["cat ${scriptDir} log"]}
    },
    "projectScripts": {
        // "_comment": "executed in each project. Logged like the other commands",
        "update": {
            "description": "updates the package.json in each projects", "commands": [
                "laoban makePackageJson ${laoban.projectDetails.template}",
                "laoban cp -r ${laoban.projectDetails.template} ."
            ]
        },
        "remoteLink": {
            "description": "call '${packageManager} link' in each project directory",
            "commands": ["${packageManager} link"]
        },
        "ls": {"description": "lists all the projects", "commands": ["pwd"]},
        "install": {
            "description": "does the initial install/link/tsc/test... etc in each project",
            "commands": [
                "echo \"Installing in `pwd` \"",
                {"name": "install", "command": "${packageManager} install", "status": true},
                {"name": "link", "command": "${packageManager} link", "status": true},
                {"name": "remoteLink", "command": "laoban remoteLink", "status": true},
                {"name": "tsc", "command": "tsc", "status": true},
                {"name": "test", "command": "${packageManager} test", "status": true}
            ]
        },
        "pack": {
            "description": "does everything for a publish except the actual 'npm publish'",
            "commands": [
                "find . -type f -name 'enzymeAdapterSetup.*' -delete",
                "${packageManager} pack"
            ]
        },
        "publish": {
            "description": "publishes the projects to npmjs",
            "commands": [
                "find . -type f -name 'enzymeAdapterSetup.*' -delete",
                "${packageManager} pack"
            ]
        }
    }
}
