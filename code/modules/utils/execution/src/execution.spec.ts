// execute.command.spec.ts

import {isErrors, isValue} from "@laoban/errors"
import {
    ExecuteCommandRequest,
    executeCommand,
    ExecutionConfig,
    ExecutionOptions,
    ExecutorFn
} from "./execution"

type TestWritable = {
    writes: string[]
}

type ExecutorName = "script" | "js" | "file"

type Call = {
    executorName: ExecutorName
    command: string
    cwd: string
    env: Record<string, string>
    writable: TestWritable
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
        }
    }
}

function makeExecutor(
    executorName: ExecutorName,
    calls: Call[],
    exitCode: number = 0
): ExecutorFn<TestWritable> {
    return async (command, cwd, env, writable, _observability) => {
        calls.push({
            executorName,
            command,
            cwd,
            env,
            writable
        })
        return exitCode
    }
}

function makeConfig(
    calls: Call[],
    exitCodes: Partial<Record<ExecutorName, number>> = {}
): ExecutionConfig<TestWritable, ExecutorName> {
    return {
        executors: new Map<ExecutorName, ExecutorFn<TestWritable>>([
            ["script", makeExecutor("script", calls, exitCodes.script ?? 0)],
            ["js", makeExecutor("js", calls, exitCodes.js ?? 0)],
            ["file", makeExecutor("file", calls, exitCodes.file ?? 0)]
        ])
    }
}

function makeRequest(
    command: string,
    config: ExecutionConfig<TestWritable, ExecutorName>,
    writable: TestWritable = {writes: []},
    booleans: ExecutionOptions = {}
): ExecuteCommandRequest<TestWritable, ExecutorName> {
    const {observability} = testObservability()

    return {
        command,
        cwd: "/workspace/pkg-a",
        env: {HELLO: "world"},
        writable,
        observability: observability as any,
        config,
        ...booleans
    }
}

function makeRequestWithLogs(
    command: string,
    config: ExecutionConfig<TestWritable, ExecutorName>,
    logs: unknown[][],
    booleans: ExecutionOptions = {},
    writable: TestWritable = {writes: []}
): ExecuteCommandRequest<TestWritable, ExecutorName> {
    const {observability} = testObservability()

    return {
        command,
        cwd: "/workspace/pkg-a",
        env: {HELLO: "world"},
        writable,
        observability: {
            ...(observability as any),
            log: (...msg: unknown[]) => logs.push(msg)
        },
        config,
        ...booleans
    }
}

const execute = executeCommand<TestWritable, ExecutorName>({
    prefixAndValueOptions: {
        defaultPrefix: "script",
        separator: ":"
    }
})

describe("executeCommand", () => {
    it("uses the default prefix executor when the command has no prefix", async () => {
        const calls: Call[] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequest("tsc --noEmit", config))

        expect(isValue(result)).toEqual(true)
        if (isValue(result)) expect(result.value).toEqual(0)

        expect(calls).toEqual([
            {
                executorName: "script",
                command: "tsc --noEmit",
                cwd: "/workspace/pkg-a",
                env: {HELLO: "world"},
                writable: {writes: []}
            }
        ])
    })

    it("uses the prefixed executor and strips the prefix before execution", async () => {
        const calls: Call[] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequest("js:1 + 2", config))

        expect(isValue(result)).toEqual(true)
        if (isValue(result)) expect(result.value).toEqual(0)

        expect(calls).toEqual([
            {
                executorName: "js",
                command: "1 + 2",
                cwd: "/workspace/pkg-a",
                env: {HELLO: "world"},
                writable: {writes: []}
            }
        ])
    })

    it("only splits on the first separator", async () => {
        const calls: Call[] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequest("file:cat(a:b:c)", config))

        expect(isValue(result)).toEqual(true)
        if (isValue(result)) expect(result.value).toEqual(0)

        expect(calls).toEqual([
            {
                executorName: "file",
                command: "cat(a:b:c)",
                cwd: "/workspace/pkg-a",
                env: {HELLO: "world"},
                writable: {writes: []}
            }
        ])
    })

    it("returns the executor exit code", async () => {
        const calls: Call[] = []
        const config = makeConfig(calls, {script: 7})

        const result = await execute(makeRequest("tsc --noEmit", config))

        expect(isValue(result)).toEqual(true)
        if (isValue(result)) expect(result.value).toEqual(7)
    })

    it("passes the same writable object to the executor", async () => {
        const calls: Call[] = []
        const config = makeConfig(calls)
        const writable = {writes: []}

        await execute(makeRequest("tsc --noEmit", config, writable))

        expect(calls).toHaveLength(1)
        expect(calls[0].writable).toBe(writable)
    })

    it("returns a structured error when no executor is registered for the prefix", async () => {
        const calls: Call[] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequest("docker:build .", config))

        expect(isErrors(result)).toEqual(true)
        if (isErrors(result)) {
            expect(result.errors).toEqual([
                {
                    kind: "missingCommandExecutor",
                    message: "No executor registered for prefix docker",
                    context: {
                        command: "docker:build .",
                        cwd: "/workspace/pkg-a",
                        executorName: "docker",
                        registeredExecutors: ["script", "js", "file"]
                    }
                }
            ])
        }

        expect(calls).toEqual([])
    })

    it("returns a structured error when the executor throws", async () => {
        const config: ExecutionConfig<TestWritable, ExecutorName> = {
            executors: new Map<ExecutorName, ExecutorFn<TestWritable>>([
                ["script", async () => {
                    throw new Error("boom")
                }],
                ["js", async () => 0],
                ["file", async () => 0]
            ])
        }

        const result = await execute(makeRequest("tsc --noEmit", config))

        expect(isErrors(result)).toEqual(true)
        if (isErrors(result)) {
            expect(result.errors).toEqual([
                {
                    kind: "commandExecutionException",
                    message: "Command execution failed",
                    context: {
                        command: "tsc --noEmit",
                        executorName: "script",
                        executableCommand: "tsc --noEmit",
                        cwd: "/workspace/pkg-a",
                        error: "Error: boom"
                    }
                }
            ])
        }
    })

    it("logs the current directory when title is enabled", async () => {
        const calls: Call[] = []
        const logs: unknown[][] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequestWithLogs(
            "tsc --noEmit",
            config,
            logs,
            {title: true}
        ))

        expect(isValue(result)).toEqual(true)
        expect(logs).toEqual([
            ["/workspace/pkg-a"]
        ])
        expect(calls).toHaveLength(1)
    })

    it("logs the original command when debug is enabled", async () => {
        const calls: Call[] = []
        const logs: unknown[][] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequestWithLogs(
            "js:1 + 2",
            config,
            logs,
            {debug: true}
        ))

        expect(isValue(result)).toEqual(true)
        expect(logs).toEqual([
            ["js:1 + 2"]
        ])
        expect(calls).toEqual([
            {
                executorName: "js",
                command: "1 + 2",
                cwd: "/workspace/pkg-a",
                env: {HELLO: "world"},
                writable: {writes: []}
            }
        ])
    })

    it("logs the original command and does not execute when dryRun is enabled", async () => {
        const calls: Call[] = []
        const logs: unknown[][] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequestWithLogs(
            "js:1 + 2",
            config,
            logs,
            {dryRun: true}
        ))

        expect(isValue(result)).toEqual(true)
        if (isValue(result)) expect(result.value).toEqual(0)

        expect(logs).toEqual([
            ["js:1 + 2"]
        ])
        expect(calls).toEqual([])
    })

    it("logs title then command when title and dryRun are enabled", async () => {
        const calls: Call[] = []
        const logs: unknown[][] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequestWithLogs(
            "tsc --noEmit",
            config,
            logs,
            {
                title: true,
                dryRun: true
            }
        ))

        expect(isValue(result)).toEqual(true)
        if (isValue(result)) expect(result.value).toEqual(0)

        expect(logs).toEqual([
            ["/workspace/pkg-a"],
            ["tsc --noEmit"]
        ])
        expect(calls).toEqual([])
    })

    it("logs the command once when debug and dryRun are both enabled", async () => {
        const calls: Call[] = []
        const logs: unknown[][] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequestWithLogs(
            "tsc --noEmit",
            config,
            logs,
            {
                debug: true,
                dryRun: true
            }
        ))

        expect(isValue(result)).toEqual(true)
        expect(logs).toEqual([
            ["tsc --noEmit"]
        ])
        expect(calls).toEqual([])
    })

    it("logs title and command when title and debug are enabled and still executes", async () => {
        const calls: Call[] = []
        const logs: unknown[][] = []
        const config = makeConfig(calls)

        const result = await execute(makeRequestWithLogs(
            "file:pwd()",
            config,
            logs,
            {
                title: true,
                debug: true
            }
        ))

        expect(isValue(result)).toEqual(true)
        expect(logs).toEqual([
            ["/workspace/pkg-a"],
            ["file:pwd()"]
        ])
        expect(calls).toEqual([
            {
                executorName: "file",
                command: "pwd()",
                cwd: "/workspace/pkg-a",
                env: {HELLO: "world"},
                writable: {writes: []}
            }
        ])
    })
})