import {AnyCliCommand, BasicCliContext, CliCommand, defineCommand} from "@laoban/clidsl";
import {LaobanScript, LaobanScripts, ScriptName} from "@laoban/scripts";
import {mapObject, sortObjectByName} from "@laoban/records";

export interface ScriptCommandValues {
    dryrun: boolean;
    shellDebug: boolean;
    quiet: boolean;
    variables: boolean;
    one: boolean;
    all: boolean;
    packages: string;
    generationPlan: boolean;
    throttle: string;
    links: boolean;
    debug: string;
    sessionId: string;
    ignoreGuards: boolean;
}

export type ExecuteLaobanScriptFn<TContext extends BasicCliContext> =
    (scriptName: ScriptName, script: LaobanScript, values: ScriptCommandValues, context: TContext) => Promise<any>;

export interface LaobanScriptCliContext extends BasicCliContext {
    executeLaobanScript: ExecuteLaobanScriptFn<LaobanScriptCliContext>;
}

export const scriptCommandOptions = {
    dryrun: {
        shortName: "d",
        description: "displays the command instead of executing it",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    shellDebug: {
        shortName: "s",
        description: "debugging around the shell",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    quiet: {
        shortName: "q",
        description: "don't display the output from the commands",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    variables: {
        shortName: "v",
        description: "used when debugging scripts. Shows the variables available to a command when the command is executed",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    one: {
        shortName: "1",
        description: "executes in this project directory (opposite of --all)",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    all: {
        shortName: "a",
        description: "executes this in all projects, even if 'ín' a project",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    packages: {
        shortName: "p",
        description: "executes this in the packages matching the regex. e.g. -p 'name'",
        type: "string" as const,
        required: false,
        defaultValue: ""
    },
    generationPlan: {
        shortName: "g",
        description: "instead of executing shows the generation plan",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    throttle: {
        shortName: "t",
        description: "only this number of scripts will be executed in parallel",
        type: "string" as const,
        required: false,
        defaultValue: "0"
    },
    links: {
        shortName: "l",
        description: "the scripts will be put into generations based on links",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    },
    debug: {
        description: "enables debugging. <debug> is a space separated list. legal values include [session,update,link,guard,templates,files, scripts]",
        type: "string" as const,
        required: false,
        defaultValue: ""
    },
    sessionId: {
        description: "specifies the session id, which is mainly used for logging",
        type: "string" as const,
        required: false,
        defaultValue: ""
    },
    ignoreGuards: {
        description: "Runs the command ignoring any guards. This may give erratic behaviour!",
        type: "boolean" as const,
        required: false,
        defaultValue: false
    }
};


export function makeScriptCommand<C extends LaobanScriptCliContext>(
    scriptName: ScriptName,
    script: LaobanScript
): CliCommand<ScriptCommandValues, C> {
    return defineCommand()({
        description: script.description,
        positionals: {},
        options: scriptCommandOptions,
        execute: async (values: ScriptCommandValues, context: C) =>
            context.executeLaobanScript(scriptName, script, values, context)
    });
}

export function makeScriptCommands<C extends LaobanScriptCliContext>(
    scripts: LaobanScripts
): Record<string, CliCommand<ScriptCommandValues, C>> {
    return sortObjectByName(mapObject(
        scripts,
        ((script, name) => makeScriptCommand<C>(name, script)
        )));
}
