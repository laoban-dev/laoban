// js.executor.test.ts

import {Writable} from "node:stream"
import {nullObservability, Observability} from "@laoban/observability"
import {
    executeNodeJs,
    makeExecuteJs,
    nodeWritableTc,
    noConsoleRedirect,
    withConsoleRedirectedToNodeWritable,
    WritableTc,
} from "./js.execution"

type TestWritable = {
    writes: string[]
}

const testWritableTc: WritableTc<TestWritable> = {
    writeString: async (writable, text) => {
        writable.writes.push(text)
    },
}

const testWritable = (): TestWritable => ({
    writes: [],
})

const testObservability = (): Observability => ({
    ...nullObservability("test-correlation-id"),
    log: jest.fn(),
})

const env = {TEST: "true"}

describe("makeExecuteJs", () => {
    it("returns 0 when the command evaluates successfully", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const executeJs = makeExecuteJs(testWritableTc)

        const exitCode = await executeJs(
            "1 + 1",
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writable.writes).toEqual([])
        expect(observability.log).not.toHaveBeenCalled()
    })

    it("writes returned strings through the supplied writable typeclass", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const executeJs = makeExecuteJs(testWritableTc)

        const exitCode = await executeJs(
            `"hello"`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writable.writes).toEqual(["hello"])
    })

    it("awaits async command expressions", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const executeJs = makeExecuteJs(testWritableTc)

        const exitCode = await executeJs(
            `Promise.resolve("async result")`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writable.writes).toEqual(["async result"])
    })

    it("passes context, cwd, env, writable and observability into the expression", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const executeJs = makeExecuteJs(testWritableTc)

        const exitCode = await executeJs(
            `[
                context.cwd,
                cwd,
                context.env.TEST,
                env.TEST,
                context.writable === writable,
                context.observability === observability
            ].join("|")`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writable.writes).toEqual([
            "/tmp/project|/tmp/project|true|true|true|true",
        ])
    })

    it("uses strict mode inside the evaluated function", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const executeJs = makeExecuteJs(testWritableTc)

        const exitCode = await executeJs(
            `this === undefined ? "strict" : "not strict"`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writable.writes).toEqual(["strict"])
    })

    it("does not write non-string return values", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const executeJs = makeExecuteJs(testWritableTc)

        const exitCode = await executeJs(
            `({a: 1})`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writable.writes).toEqual([])
    })

    it("returns 1 and logs when evaluation throws", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const executeJs = makeExecuteJs(testWritableTc)

        const exitCode = await executeJs(
            `(() => { throw new Error("boom") })()`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(1)
        expect(writable.writes).toEqual([])
        expect(observability.log).toHaveBeenCalledWith(
            "Error executing javascript command: Error: boom",
        )
    })

    it("returns 1 and logs when writing the returned string fails", async () => {
        const writable = testWritable()
        const observability = testObservability()

        const failingWritableTc: WritableTc<TestWritable> = {
            writeString: async () => {
                throw new Error("write failed")
            },
        }

        const executeJs = makeExecuteJs(failingWritableTc)

        const exitCode = await executeJs(
            `"hello"`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(1)
        expect(observability.log).toHaveBeenCalledWith(
            "Error executing javascript command: Error: write failed",
        )
    })

    it("uses the supplied console redirect wrapper", async () => {
        const writable = testWritable()
        const observability = testObservability()
        const events: string[] = []

        const redirect = jest.fn(async (_writable: TestWritable, block: () => Promise<number>) => {
            events.push("before")
            const result = await block()
            events.push("after")
            return result
        })

        const executeJs = makeExecuteJs(testWritableTc, redirect)

        const exitCode = await executeJs(
            `"hello"`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(redirect).toHaveBeenCalledTimes(1)
        expect(redirect).toHaveBeenCalledWith(writable, expect.any(Function))
        expect(events).toEqual(["before", "after"])
        expect(writable.writes).toEqual(["hello"])
    })

    it("noConsoleRedirect just executes the block", async () => {
        const result = await noConsoleRedirect(testWritable(), async () => 123)

        expect(result).toBe(123)
    })
})

describe("nodeWritableTc", () => {
    const recordingNodeWritable = () => {
        const writes: string[] = []

        const writable = new Writable({
            write(chunk, _encoding, callback) {
                writes.push(String(chunk))
                callback()
            },
        })

        return {writable, writes}
    }

    it("writes strings to a Node Writable", async () => {
        const {writable, writes} = recordingNodeWritable()

        await nodeWritableTc.writeString(writable, "hello")

        expect(writes).toEqual(["hello"])
    })

    it("rejects when the Node Writable reports a write error", async () => {
        const writable = {
            write: jest.fn((_text: string, callback: (error?: Error | null) => void) => {
                callback(new Error("write failed"))
                return true
            }),
        } as unknown as Writable

        await expect(
            nodeWritableTc.writeString(writable, "hello"),
        ).rejects.toThrow("write failed")

        expect(writable.write).toHaveBeenCalledWith("hello", expect.any(Function))
    })
})

describe("withConsoleRedirectedToNodeWritable", () => {
    const recordingNodeWritable = () => {
        const writes: string[] = []

        const writable = new Writable({
            write(chunk, _encoding, callback) {
                writes.push(String(chunk))
                callback()
            },
        })

        return {writable, writes}
    }

    it("redirects process stdout writes to the supplied Node Writable", async () => {
        const {writable, writes} = recordingNodeWritable()

        const result = await withConsoleRedirectedToNodeWritable(writable, async () => {
            process.stdout.write("hello stdout")
            return 0
        })

        expect(result).toBe(0)
        expect(writes).toEqual(["hello stdout"])
    })

    it("redirects process stderr writes to the supplied Node Writable", async () => {
        const {writable, writes} = recordingNodeWritable()

        const result = await withConsoleRedirectedToNodeWritable(writable, async () => {
            process.stderr.write("hello stderr")
            return 0
        })

        expect(result).toBe(0)
        expect(writes).toEqual(["hello stderr"])
    })

    it("restores process stdout and stderr after success", async () => {
        const {writable} = recordingNodeWritable()
        const originalStdoutWrite = process.stdout.write
        const originalStderrWrite = process.stderr.write

        await withConsoleRedirectedToNodeWritable(writable, async () => 0)

        expect(process.stdout.write).toBe(originalStdoutWrite)
        expect(process.stderr.write).toBe(originalStderrWrite)
    })

    it("restores process stdout and stderr after failure", async () => {
        const {writable} = recordingNodeWritable()
        const originalStdoutWrite = process.stdout.write
        const originalStderrWrite = process.stderr.write

        await expect(
            withConsoleRedirectedToNodeWritable(writable, async () => {
                throw new Error("boom")
            }),
        ).rejects.toThrow("boom")

        expect(process.stdout.write).toBe(originalStdoutWrite)
        expect(process.stderr.write).toBe(originalStderrWrite)
    })
})

describe("executeNodeJs", () => {
    const recordingNodeWritable = () => {
        const writes: string[] = []

        const writable = new Writable({
            write(chunk, _encoding, callback) {
                writes.push(String(chunk))
                callback()
            },
        })

        return {writable, writes}
    }

    it("writes returned strings to a Node Writable", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `"hello node"`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual(["hello node"])
    })

    it("redirects stdout and stderr during command execution", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `(() => {
                process.stdout.write("stdout")
                process.stderr.write("stderr")
                return "return"
            })()`,
            "/tmp/project",
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual(["stdout", "stderr", "return"])
    })
})