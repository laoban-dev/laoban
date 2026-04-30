// node.execution.ts

import {Writable} from "node:stream"
import {
    defaultPrefixAndValueOptions,
    executeCommand,
    ExecuteCommand,

    ExecutionConfig,
    ExecutorFn,
    PrefixAndValueOptions,
} from "@laoban/execution"
import {defaultFileCommands, FileCommands, makeFileExecutor} from "./file.execution"
import {executeChildProcess} from "./child.process.execution"
import {executeNodeJs} from "./js.execution";

export type NodeExecutorName = "script" | "js" | "file"

export type NodeExecutionOptions = Readonly<{
    prefixAndValueOptions?: PrefixAndValueOptions
    fileCommands?: FileCommands
}>

export type NodeExecution = Readonly<{
    execute: ExecuteCommand<Writable, NodeExecutorName>
    config: ExecutionConfig<Writable, NodeExecutorName>
}>

export function defaultNodeExecutors(
    fileCommands: FileCommands = defaultFileCommands
): Record<NodeExecutorName, ExecutorFn<Writable>> {
    return {
        script: executeChildProcess,
        js: executeNodeJs,
        file: makeFileExecutor(fileCommands)
    }
}

export function toExecutorMap<ExecutorName extends string, Writable>(
    executors: Record<ExecutorName, ExecutorFn<Writable>>
): Map<ExecutorName, ExecutorFn<Writable>> {
    return new Map(
        Object.entries(executors) as [ExecutorName, ExecutorFn<Writable>][]
    )
}

export function makeNodeExecution(
    options: NodeExecutionOptions = {}
): NodeExecution {
    const config: ExecutionConfig<Writable, NodeExecutorName> = {
        executors: toExecutorMap(defaultNodeExecutors(
            options.fileCommands ?? defaultFileCommands
        ))
    }

    const execute = executeCommand<Writable, NodeExecutorName>({
        prefixAndValueOptions: options.prefixAndValueOptions ?? defaultPrefixAndValueOptions
    })

    return {execute, config}
}