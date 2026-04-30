// node.execution.spec.ts

import {Writable} from "node:stream"
import {ExecuteCommand, ExecutionConfig, ExecutorFn} from "@laoban/execution"
import {defaultNodeExecutors, makeNodeExecution, NodeExecutorName} from "./node.execution"
import {FileCommands} from "./file.execution"
import {executeChildProcess} from "./child.process.execution"
import {executeNodeJs} from "./js.execution";

class RecordingWritable extends Writable {
    public writes: string[] = []

    _write(
        chunk: Buffer | string,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void
    ): void {
        this.writes.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk))
        callback()
    }

    text(): string {
        return this.writes.join("")
    }
}

function testObservability() {
    const logs: unknown[][] = []
    const debugCalls: unknown[][] = []

    return {
        logs,
        debugCalls,
        observability: {
            correlationId: "test",
            module: "test-module",
            debugLevels: {},
            timeService: {now: () => 0},
            templates: {},
            dictionary: {},
            log: (...msg: unknown[]) => logs.push(msg),
            debug: (...msg: unknown[]) => debugCalls.push(msg),
            countMetric: jest.fn(),
            durationMetric: jest.fn()
        } as any
    }
}

function isValue<T>(r: any): r is { value: T } {
    return r && "value" in r
}

function isErrors(r: any): r is { errors: unknown[] } {
    return r && "errors" in r
}

describe("defaultNodeExecutors", () => {
    it("creates the standard script, js and file executors", () => {
        const executors = defaultNodeExecutors()

        expect(Object.keys(executors).sort()).toEqual(["file", "js", "script"])
        expect(executors.script).toBe(executeChildProcess)
        expect(executors.js).toBe(executeNodeJs)
        expect(typeof executors.file).toEqual("function")
    })

    it("uses the supplied file commands when creating the file executor", async () => {
        const calls: Array<{
            command: string
            cwd: string
            env: Record<string, string>
            writable: Writable
        }> = []

        const customFileCommands: FileCommands = {
            custom: async (cwd, args, env, writable) => {
                calls.push({
                    command: args.join(","),
                    cwd,
                    env,
                    writable
                })
                return 7
            }
        }

        const executors = defaultNodeExecutors(customFileCommands)
        const writable = new RecordingWritable()

        const exitCode = await executors.file(
            "custom(a,b)",
            "/workspace/pkg",
            {HELLO: "world"},
            writable,
            testObservability().observability
        )

        expect(exitCode).toEqual(7)
        expect(calls).toEqual([
            {
                command: "a,b",
                cwd: "/workspace/pkg",
                env: {HELLO: "world"},
                writable
            }
        ])
    })
})

describe("makeNodeExecution", () => {
    it("returns an execute function and execution config", () => {
        const nodeExecution = makeNodeExecution()

        expect(typeof nodeExecution.execute).toEqual("function")
        expect(nodeExecution.config.executors).toBeInstanceOf(Map)
        expect(Array.from(nodeExecution.config.executors.keys()).sort()).toEqual([
            "file",
            "js",
            "script"
        ])
    })

    it("config only contains executors", () => {
        const nodeExecution = makeNodeExecution()

        expect(nodeExecution.config).toEqual({
            executors: nodeExecution.config.executors
        })
        expect((nodeExecution.config as any).dryRun).toBeUndefined()
        expect((nodeExecution.config as any).debug).toBeUndefined()
        expect((nodeExecution.config as any).title).toBeUndefined()
    })

    it("uses the default prefix so an unprefixed command runs with the script executor", async () => {
        const calls: Array<{
            command: string
            cwd: string
            env: Record<string, string>
            writable: RecordingWritable
        }> = []

        const scriptExecutor: ExecutorFn<Writable> = async (
            command,
            cwd,
            env,
            writable
        ) => {
            calls.push({
                command,
                cwd,
                env,
                writable: writable as RecordingWritable
            })
            return 9
        }

        const nodeExecution = makeNodeExecution()
        const config: ExecutionConfig<Writable, NodeExecutorName> = {
            executors: new Map<NodeExecutorName, ExecutorFn<Writable>>([
                ["script", scriptExecutor],
                ["js", async () => 0],
                ["file", async () => 0]
            ])
        }

        const writable = new RecordingWritable()
        const result = await (nodeExecution.execute as ExecuteCommand<Writable, NodeExecutorName>)({
            command: "tsc --noEmit",
            cwd: "/workspace/pkg",
            env: {HELLO: "world"},
            writable,
            observability: testObservability().observability,
            config
        })

        expect(isValue<number>(result)).toEqual(true)
        if (isValue<number>(result)) expect(result.value).toEqual(9)

        expect(calls).toEqual([
            {
                command: "tsc --noEmit",
                cwd: "/workspace/pkg",
                env: {HELLO: "world"},
                writable
            }
        ])
    })

    it("uses the prefixed js executor", async () => {
        const calls: string[] = []

        const nodeExecution = makeNodeExecution()
        const config: ExecutionConfig<Writable, NodeExecutorName> = {
            executors: new Map<NodeExecutorName, ExecutorFn<Writable>>([
                ["script", async () => 0],
                ["js", async command => {
                    calls.push(command)
                    return 5
                }],
                ["file", async () => 0]
            ])
        }

        const result = await (nodeExecution.execute as ExecuteCommand<Writable, NodeExecutorName>)({
            command: "js:1 + 2",
            cwd: "/workspace/pkg",
            env: {},
            writable: new RecordingWritable(),
            observability: testObservability().observability,
            config
        })

        expect(isValue<number>(result)).toEqual(true)
        if (isValue<number>(result)) expect(result.value).toEqual(5)

        expect(calls).toEqual(["1 + 2"])
    })

    it("uses the prefixed file executor", async () => {
        const calls: string[] = []

        const nodeExecution = makeNodeExecution()
        const config: ExecutionConfig<Writable, NodeExecutorName> = {
            executors: new Map<NodeExecutorName, ExecutorFn<Writable>>([
                ["script", async () => 0],
                ["js", async () => 0],
                ["file", async command => {
                    calls.push(command)
                    return 6
                }]
            ])
        }

        const result = await (nodeExecution.execute as ExecuteCommand<Writable, NodeExecutorName>)({
            command: "file:pwd()",
            cwd: "/workspace/pkg",
            env: {},
            writable: new RecordingWritable(),
            observability: testObservability().observability,
            config
        })

        expect(isValue<number>(result)).toEqual(true)
        if (isValue<number>(result)) expect(result.value).toEqual(6)

        expect(calls).toEqual(["pwd()"])
    })

    it("supports custom prefix options", async () => {
        const calls: string[] = []

        const nodeExecution = makeNodeExecution({
            prefixAndValueOptions: {
                defaultPrefix: "script",
                separator: "=>"
            }
        })

        const config: ExecutionConfig<Writable, NodeExecutorName> = {
            executors: new Map<NodeExecutorName, ExecutorFn<Writable>>([
                ["script", async () => 0],
                ["js", async command => {
                    calls.push(command)
                    return 0
                }],
                ["file", async () => 0]
            ])
        }

        const result = await (nodeExecution.execute as ExecuteCommand<Writable, NodeExecutorName>)({
            command: "js=>1 + 2",
            cwd: "/workspace/pkg",
            env: {},
            writable: new RecordingWritable(),
            observability: testObservability().observability,
            config
        })

        expect(isValue<number>(result)).toEqual(true)
        expect(calls).toEqual(["1 + 2"])
    })

    it("uses supplied file commands in the returned config", async () => {
        const fileCommands: FileCommands = {
            hello: async (_cwd, _args, _env, writable) => {
                writable.write("hello")
                return 4
            }
        }

        const nodeExecution = makeNodeExecution({
            fileCommands
        })

        const writable = new RecordingWritable()
        const result = await nodeExecution.execute({
            command: "file:hello()",
            cwd: "/workspace/pkg",
            env: {},
            writable,
            observability: testObservability().observability,
            config: nodeExecution.config
        })

        expect(isValue<number>(result)).toEqual(true)
        if (isValue<number>(result)) expect(result.value).toEqual(4)
        expect(writable.text()).toEqual("hello")
    })

    it("passes title/debug/dryRun on the request, not the config", async () => {
        const nodeExecution = makeNodeExecution()
        const {observability, logs} = testObservability()

        const result = await nodeExecution.execute({
            command: "file:hello()",
            cwd: "/workspace/pkg",
            env: {},
            writable: new RecordingWritable(),
            observability,
            config: nodeExecution.config,
            title: true,
            debug: true,
            dryRun: true
        })

        expect(isValue<number>(result)).toEqual(true)
        if (isValue<number>(result)) expect(result.value).toEqual(0)

        expect(logs).toEqual([
            ["/workspace/pkg"],
            ["file:hello()"]
        ])
    })

    it("returns an error for an unknown prefix", async () => {
        const nodeExecution = makeNodeExecution()

        const result = await nodeExecution.execute({
            command: "docker:build .",
            cwd: "/workspace/pkg",
            env: {},
            writable: new RecordingWritable(),
            observability: testObservability().observability,
            config: nodeExecution.config
        })

        expect(isErrors(result)).toEqual(true)
        if (isErrors(result)) {
            expect(result.errors).toEqual([
                {
                    kind: "missingCommandExecutor",
                    message: "No executor registered for prefix docker",
                    context: {
                        command: "docker:build .",
                        cwd: "/workspace/pkg",
                        executorName: "docker",
                        registeredExecutors: ["script", "js", "file"]
                    }
                }
            ])
        }
    })
})