import {LaobanPackageCliContext} from "@laoban/package_cli"
import {ObservabilityContext} from "@laoban/observability"
import {ScriptExecutionItemTemplateDictionaryFn} from "./resolve.templates"
import {ExecuteCommand, ExecutionConfig,} from "@laoban/execution"
import {ScriptFilterValues} from "./filter.packages"
import {LaobanScript, ScriptName} from "@laoban/scripts"
import {ErrorsOr} from "@laoban/errors"
import {Env} from "@laoban/records";

export type LaobanExecution<
    WriteChannel,
    ExecutorName extends string = string,
> = Readonly<{
    execute: ExecuteCommand<WriteChannel, ExecutorName>
    config: ExecutionConfig<WriteChannel, ExecutorName>
}>

export type LaobanScriptCliContext<
    ReadChannel,
    WriteChannel,
    Ref,
    ExecutorName extends string = string,
> =
    LaobanPackageCliContext<ReadChannel, WriteChannel, Ref> &
    ObservabilityContext & {
    handleLaobanScript: HandleLaobanScriptFn<
        LaobanScriptCliContext<
            ReadChannel,
            WriteChannel,
            Ref,
            ExecutorName
        >,
        ReadChannel,
        WriteChannel,
        Ref
    >
    makeDictionary: ScriptExecutionItemTemplateDictionaryFn
    execution: LaobanExecution<WriteChannel, ExecutorName>
    env: Env
}

export interface ScriptCommandValues extends ScriptFilterValues {
    // one: boolean; from ScriptFilterValues
    // all: boolean;
    // packages: string;
    dryrun: boolean
    shellDebug: boolean
    quiet: boolean
    variables: boolean
    generationPlan: boolean
    throttle: string
    sessionId: string
    ignoreGuards: boolean
}

export type HandleLaobanScriptFn<
    TContext extends LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>,
    ReadChannel,
    WriteChannel,
    Ref,
> =
    (
        scriptName: ScriptName,
        script: LaobanScript,
        values: ScriptCommandValues,
        context: TContext,
    ) => Promise<ErrorsOr<any>>

export type ReferenceFileName = string
export type Purpose = "log" | "session"