import {LaobanPackageCliContext} from "@laoban/package_cli";
import {ChannelsState, ObservabilityContext} from "@laoban/observability";
import {ScriptExecutionItemTemplateDictionaryFn} from "./resolve.templates";
import {NodeReadChannel, NodeWriteChannel} from "@laoban/observability_node";
import {NodeExecution} from "@laoban/node_execution";
import {Env} from "@laoban/records";
import {ScriptFilterValues} from "./filter.packages";
import {LaobanScript, ScriptName} from "@laoban/scripts";
import {ErrorsOr} from "@laoban/errors";

export type LaobanScriptCliContext<ReadChannel, WriteChannel, Ref> =
    LaobanPackageCliContext<ReadChannel, WriteChannel, Ref> &
    ObservabilityContext & {
    handleLaobanScript: HandleLaobanScriptFn<
        LaobanScriptCliContext<ReadChannel, WriteChannel, Ref>, ReadChannel, WriteChannel, Ref>
    makeDictionary: ScriptExecutionItemTemplateDictionaryFn
    execution: NodeExecution
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

export type HandleLaobanScriptFn<TContext extends LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>, ReadChannel, WriteChannel, Ref> =
    (scriptName: ScriptName, script: LaobanScript, values: ScriptCommandValues, context: TContext) => Promise<ErrorsOr<any>>;

export type ReferenceFileName = string
export type Purpose = 'log' | 'session'