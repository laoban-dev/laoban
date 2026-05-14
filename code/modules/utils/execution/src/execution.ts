// execution.ts

import {BaseIssue, errors, ErrorsOr, value} from "@laoban/errors"
import {DebugName, Observability} from "@laoban/observability"
import {PrefixAndValueOptions, toPrefixAndValue} from "./prefix.and.value"
import {Env} from "@laoban/records";

export type ExitCode = number
export type DirectoryName = string


const scriptExecutionDebug: DebugName = ["script", "execution"]

export type ExecutorFn<Writable> = (
    command: string,
    cwd: DirectoryName,
    env: Env,
    writable: Writable,
    observability: Observability
) => Promise<ExitCode>

export type ExecutionOptions = Readonly<{
    dryRun?: boolean
    debug?: boolean | DebugName
    title?: boolean
}>

export type ExecutionConfig<Writable, ExecutorName extends string> = Readonly<{
    executors: Map<ExecutorName, ExecutorFn<Writable>>
}>

export type ExecuteCommandRequest<Writable, ExecutorName extends string> =
    ExecutionOptions & Readonly<{
    command: string
    cwd: DirectoryName
    env: Env
    writable: Writable
    observability: Observability
    config: ExecutionConfig<Writable, ExecutorName>
}>

export type ExecuteCommand<Writable, ExecutorName extends string> = (
    request: ExecuteCommandRequest<Writable, ExecutorName>
) => Promise<ErrorsOr<ExitCode, BaseIssue>>

export type ExecutionOrchestratorConfig = Readonly<{
    prefixAndValueOptions: PrefixAndValueOptions
}>

export function missingExecutorError<Writable, ExecutorName extends string>(
    request: ExecuteCommandRequest<Writable, ExecutorName>,
    executorName: string
): ErrorsOr<ExitCode, BaseIssue> {
    return errors({
        kind: "missingCommandExecutor",
        message: `No executor registered for prefix ${executorName}`,
        context: {
            command: request.command,
            cwd: request.cwd,
            executorName,
            registeredExecutors: Array.from(request.config.executors.keys()),
        },
    })
}

export function executionExceptionError<Writable, ExecutorName extends string>(
    request: ExecuteCommandRequest<Writable, ExecutorName>,
    executorName: string,
    executableCommand: string,
    e: unknown
): ErrorsOr<ExitCode, BaseIssue> {
    return errors({
        kind: "commandExecutionException",
        message: "Command execution failed",
        context: {
            command: request.command,
            executorName,
            executableCommand,
            cwd: request.cwd,
            error: String(e),
        },
    })
}

const debugNameFor = (debug: ExecutionOptions["debug"]): DebugName =>
    Array.isArray(debug) ? debug : scriptExecutionDebug

export function executeCommand<Writable, ExecutorName extends string>(
    orchestratorConfig: ExecutionOrchestratorConfig
): ExecuteCommand<Writable, ExecutorName> {
    return async request => {
        const parsed = toPrefixAndValue(
            request.command,
            orchestratorConfig.prefixAndValueOptions,
        )

        const executorName = parsed.prefix as ExecutorName
        const executableCommand = parsed.value
        const executor = request.config.executors.get(executorName)

        if (!executor)
            return missingExecutorError(request, parsed.prefix)

        if (request.title)
            request.observability.log(request.cwd)

        if (request.debug || request.dryRun)
            request.observability.log(request.command)

        if (request.debug) {
            request.observability.debug(
                debugNameFor(request.debug),
                "debug",
                "executing command with executor",
                {
                    command: request.command,
                    executableCommand,
                    executorName,
                    cwd: request.cwd,
                    dryRun: request.dryRun ?? false,
                },
            )
        }

        if (request.dryRun)
            return value(0)

        try {
            return value(await executor(
                executableCommand,
                request.cwd,
                request.env,
                request.writable,
                request.observability,
            ))
        } catch (e) {
            return executionExceptionError(request, parsed.prefix, executableCommand, e)
        }
    }
}