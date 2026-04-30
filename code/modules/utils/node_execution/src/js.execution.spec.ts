import {mkdtemp, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import * as path from "node:path"
import {Writable} from "node:stream"
import {nullObservability, Observability} from "@laoban/observability"
import {executeNodeJs} from "./js.execution"

const env = {TEST: "true"}

type RecordingObservability = Observability & {
    logged: unknown[][]
}

const testObservability = (): RecordingObservability => {
    const logged: unknown[][] = []

    return {
        ...nullObservability("test-correlation-id"),
        logged,
        log: jest.fn((...msg: unknown[]) => {
            logged.push(msg)
        }),
    }
}

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

describe("executeNodeJs", () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), "laoban-js-executor-"))
    })

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true})
    })

    it("returns 0 when the command evaluates successfully", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            "1 + 1",
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual([])
        expect(observability.log).not.toHaveBeenCalled()
    })

    it("writes returned strings through observability.log", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `"hello"`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual([])
        expect(observability.log).toHaveBeenCalledWith("hello")
        expect(observability.logged).toEqual([["hello"]])
    })

    it("rejects promise-returning command expressions", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `Promise.resolve("async result")`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(1)
        expect(writes).toEqual([])
        expect(observability.log).toHaveBeenCalledWith(
            "Error executing javascript command: Promise-returning JavaScript commands are not supported",
        )
    })

    it("passes context, cwd, env, writable and observability into the expression", async () => {
        const {writable} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `[
                context.cwd,
                cwd,
                context.env.TEST,
                env.TEST,
                context.writable === writable,
                context.observability === observability
            ].join("|")`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(observability.log).toHaveBeenCalledWith(
            `${dir}|${dir}|true|true|true|true`,
        )
    })

    it("passes the same context object fields as the individual arguments", async () => {
        const {writable} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `context.cwd === cwd &&
             context.env === env &&
             context.writable === writable &&
             context.observability === observability
                ? "same"
                : "different"`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(observability.log).toHaveBeenCalledWith("same")
    })

    it("uses strict mode inside the evaluated function", async () => {
        const {writable} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `this === undefined ? "strict" : "not strict"`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(observability.log).toHaveBeenCalledWith("strict")
    })

    it("does not write or log non-string return values", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `({a: 1})`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual([])
        expect(observability.log).not.toHaveBeenCalled()
    })

    it("does not write or log undefined return values", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `undefined`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual([])
        expect(observability.log).not.toHaveBeenCalled()
    })

    it("does not write or log numeric return values", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `123`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual([])
        expect(observability.log).not.toHaveBeenCalled()
    })

    it("returns 1 and logs when evaluation throws", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `(() => { throw new Error("boom") })()`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(1)
        expect(writes).toEqual([])
        expect(observability.log).toHaveBeenCalledWith(
            "Error executing javascript command: Error: boom",
        )
    })

    it("returns 1 and logs syntax errors", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `(() =>`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(1)
        expect(writes).toEqual([])
        expect(observability.log).toHaveBeenCalledWith(
            expect.stringContaining("Error executing javascript command: SyntaxError:"),
        )
    })

    it("temporarily changes process.cwd during synchronous evaluation", async () => {
        const {writable} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `process.cwd()`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(observability.log).toHaveBeenCalledWith(dir)
    })

    it("restores process.cwd after successful evaluation", async () => {
        const {writable} = recordingNodeWritable()
        const observability = testObservability()
        const originalCwd = process.cwd()

        const exitCode = await executeNodeJs(
            `process.cwd()`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(process.cwd()).toBe(originalCwd)
    })

    it("restores process.cwd after evaluation throws", async () => {
        const {writable} = recordingNodeWritable()
        const observability = testObservability()
        const originalCwd = process.cwd()

        const exitCode = await executeNodeJs(
            `(() => { throw new Error("boom") })()`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(1)
        expect(process.cwd()).toBe(originalCwd)
    })

    it("does not redirect stdout through the supplied writable", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `(() => {
                process.stdout.write("")
                return "done"
            })()`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual([])
        expect(observability.log).toHaveBeenCalledWith("done")
    })

    it("exposes writable to user code without automatically writing returned strings to it", async () => {
        const {writable, writes} = recordingNodeWritable()
        const observability = testObservability()

        const exitCode = await executeNodeJs(
            `(() => {
                writable.write("manual")
                return "returned"
            })()`,
            dir,
            env,
            writable,
            observability,
        )

        expect(exitCode).toBe(0)
        expect(writes).toEqual(["manual"])
        expect(observability.log).toHaveBeenCalledWith("returned")
    })
})