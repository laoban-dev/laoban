import {CliCommand, defineCommand} from "@laoban/clidsl"
import {LaobanScript, LaobanScripts, ScriptName} from "@laoban/scripts"
import {mapObject, sortObjectByName} from "@laoban/records"
import {
    LaobanScriptCliContext,
    Purpose,
    ScriptCommandValues,
} from "./script.context"

export const purposes: Purpose[] = ["log", "session"]

export const scriptCommandOptions = {
    dryrun: {
        shortName: "d",
        description: "displays the command instead of executing it",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
    shellDebug: {
        shortName: "s",
        description: "debugging around the shell",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
    quiet: {
        shortName: "q",
        description: "don't display the output from the commands",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
    variables: {
        shortName: "v",
        description: "used when debugging scripts. Shows the variables available to a command when the command is executed",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
    one: {
        shortName: "1",
        description: "executes in this project directory (opposite of --all)",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
    all: {
        shortName: "a",
        description: "executes this in all projects, even if 'ín' a project",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
    packages: {
        shortName: "p",
        description: "executes this in the packages matching the regex. e.g. -p 'name'",
        type: "string" as const,
        required: false,
        defaultValue: "",
    },
    generationPlan: {
        shortName: "g",
        description: "instead of executing shows the generation plan",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
    throttle: {
        shortName: "t",
        description: "only this number of scripts will be executed in parallel",
        type: "string" as const,
        required: false,
        defaultValue: "0",
    },
    debug: {
        description: "enables debugging. <debug> is a space separated list. legal values include [session,update,link,guard,templates,files, scripts]",
        type: "string" as const,
        required: false,
        defaultValue: "",
    },
    sessionId: {
        description: "specifies the session id, which is mainly used for logging",
        type: "string" as const,
        required: false,
        defaultValue: "",
    },
    ignoreGuards: {
        description: "Runs the command ignoring any guards. This may give erratic behaviour!",
        type: "boolean" as const,
        required: false,
        defaultValue: false,
    },
}

export function makeScriptCommand<
    ReadChannel = unknown,
    WriteChannel = unknown,
    Ref = unknown,
    C extends LaobanScriptCliContext<ReadChannel, WriteChannel, Ref> =
        LaobanScriptCliContext<ReadChannel, WriteChannel, Ref>,
>(
    scriptName: ScriptName,
    script: LaobanScript,
): CliCommand<ScriptCommandValues, C> {
    return defineCommand<ScriptCommandValues, C>()({
        description: script.description,
        positionals: {},
        options: scriptCommandOptions,
        execute: async (values: ScriptCommandValues, context: C) =>
            context.handleLaobanScript(scriptName, script, values, context),
    })
}

export function makeScriptCommands<
    ReadChannel = unknown,
    WriteChannel = unknown,
    Ref = unknown,
    C extends LaobanScriptCliContext<ReadChannel, WriteChannel, Ref> =
        LaobanScriptCliContext<ReadChannel, WriteChannel, Ref>,
>(
    scripts: LaobanScripts,
): Record<string, CliCommand<ScriptCommandValues, C>> {
    return sortObjectByName(
        mapObject(
            scripts,
            (script, name) =>
                makeScriptCommand<ReadChannel, WriteChannel, Ref, C>(
                    name,
                    script,
                ),
        ),
    )
}