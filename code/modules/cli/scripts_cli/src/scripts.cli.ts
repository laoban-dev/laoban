import {BasicCliContext, CliCommand, defineCommand} from "@laoban/clidsl";
import {LaobanScript, LaobanScripts, ScriptName} from "@laoban/scripts";
import {mapObject, sortObjectByName} from "@laoban/records";
import {LaobanPackageCliContext} from "@laoban/package_cli/src/package.cli";
import {ErrorsOr} from "@laoban/errors";
import {ScriptExecutionItemTemplateDictionaryFn} from "./resolve.templates";
import {ScriptFilterValues} from "./filter.packages";
import {ChannelsState, ObservabilityContext} from "@laoban/observability";
import {NodeReadChannel, NodeWriteChannel} from "@laoban/observability_node";

export interface ScriptCommandValues extends ScriptFilterValues {
    // one: boolean; from ScriptFilterValues
    // all: boolean;
    // packages: string;
    dryrun: boolean;
    shellDebug: boolean;
    quiet: boolean;
    variables: boolean;
    generationPlan: boolean;
    throttle: string;
    debug: string;
    sessionId: string;
    ignoreGuards: boolean;
}

export type HandleLaobanScriptFn<TContext extends LaobanPackageCliContext> =
    (scriptName: ScriptName, script: LaobanScript, values: ScriptCommandValues, context: TContext) => Promise<ErrorsOr<any>>;

export type ReferenceFileName = string
export type Purpose = 'log' | 'session'
export const purposes: Purpose[] = ['log', 'session'];

export type LaobanScriptCliContext = LaobanPackageCliContext & ObservabilityContext & {
    handleLaobanScript: HandleLaobanScriptFn<LaobanScriptCliContext>;
    makeDictionary: ScriptExecutionItemTemplateDictionaryFn
    channelsState: ChannelsState<Purpose, NodeReadChannel, NodeWriteChannel,ReferenceFileName>
    stdOut: NodeWriteChannel
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
    return defineCommand<ScriptCommandValues, C>()({
        description: script.description,
        positionals: {},
        options: scriptCommandOptions,
        execute: async (values: ScriptCommandValues, context: C) =>
            context.handleLaobanScript(scriptName, script, values, context)
    });
}

export function makeScriptCommands<C extends LaobanScriptCliContext>(
    scripts: LaobanScripts
): Record<string, CliCommand<ScriptCommandValues, C>> {
    return sortObjectByName(
        mapObject(
            scripts,
            (script, name) =>
                makeScriptCommand<C>(name, script)
        )
    );
}