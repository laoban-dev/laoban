import {LaobanPackageCliContext} from "@laoban/package_cli";
import {ChannelsState, ObservabilityContext} from "@laoban/observability";
import {ScriptExecutionItemTemplateDictionaryFn} from "./resolve.templates";
import {NodeReadChannel, NodeWriteChannel} from "@laoban/observability_node";
import {NodeExecution} from "@laoban/node_execution";
import {Env} from "@laoban/records";
import {ScriptFilterValues} from "./filter.packages";
import {LaobanScript, ScriptName} from "@laoban/scripts";
import {ErrorsOr} from "@laoban/errors";

export type LaobanScriptCliContext = LaobanPackageCliContext & ObservabilityContext & {
    handleLaobanScript: HandleLaobanScriptFn<LaobanScriptCliContext>;
    makeDictionary: ScriptExecutionItemTemplateDictionaryFn
    channelsState: ChannelsState<Purpose, NodeReadChannel, NodeWriteChannel, ReferenceFileName>
    stdOut: NodeWriteChannel
    execution: NodeExecution;
    env: Env

}

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
    sessionId: string;
    ignoreGuards: boolean;
}

export type HandleLaobanScriptFn<TContext extends LaobanPackageCliContext> =
    (scriptName: ScriptName, script: LaobanScript, values: ScriptCommandValues, context: TContext) => Promise<ErrorsOr<any>>;

export type ReferenceFileName = string
export type Purpose = 'log' | 'session'