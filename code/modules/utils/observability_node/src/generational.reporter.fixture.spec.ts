import * as fs from "node:fs/promises"
import * as path from "node:path"

import {value, valueOrThrow} from "@laoban/errors"
import {
    flushAllTouchedChannels, syncWriteTo, waitForAsyncWrites,
    withModuleObservability,
} from "@laoban/observability"
import {
    nodeObservabilityFixture,
    testNodeReference,
} from "./generational.reporter.fixture"

describe("nodeObservabilityFixture", () => {
    const fixture = nodeObservabilityFixture()

    afterEach(async () => {
        await fixture.cleanup()
    })

    it("creates a context with real node channel state, a Write function, and a stdout recorder", async () => {
        const context = await fixture.makeContext()

        expect(context.root).toEqual(expect.any(String))
        expect(context.observability).toBe(context.recording.observability)
        expect(context.channelsState.purposes).toEqual([".log", ".session"])
        expect(context.channelsState.state).toEqual({})
        expect(context.stdOutRecorder.lines()).toEqual([])

        context.stdOut("hello\n")
        context.stdOut("world\n")

        expect(context.stdOutRecorder.lines()).toEqual([
            "hello",
            "world",
        ])
    })

    it("maps module directories to real files under the temp root", async () => {
        const context = await fixture.makeContext()

        const ref = testNodeReference(context.root)(
            fixture.moduleScope("alpha", "/workspace/alpha"),
        )(".log")

        expect(ref).toEqual(
            path.join(context.root, "workspace", "alpha", ".log"),
        )
    })

    it("writes module observability output to real .log and .session files using withModuleObservability", async () => {
        const context = await fixture.makeContext()
        const moduleScope = fixture.moduleScope("alpha", "/workspace/alpha")

        const result = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                observability.log("hello alpha")
                return value(undefined)
            },
        )

        expect(valueOrThrow(result)).toBeUndefined()

        expect(await fixture.readLog(context, "/workspace/alpha")).toEqual(
            "00:00:00 INFO hello alpha\n",
        )
        expect(await fixture.readSession(context, "/workspace/alpha")).toEqual(
            "00:00:00 INFO hello alpha\n",
        )

        expect(context.channelsState.state.alpha.moduleScope).toEqual(moduleScope)
        expect(context.channelsState.state.alpha.channels).toBeUndefined()
        expect(context.channelsState.state.alpha.touched).toBe(true)
    })

    it("flushes touched real file content to the stdout recorder", async () => {
        const context = await fixture.makeContext()
        const moduleScope = fixture.moduleScope("alpha", "/workspace/alpha")

        const writeResult = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                observability.log("hello alpha")
                return value(undefined)
            },
        )

        expect(valueOrThrow(writeResult)).toBeUndefined()

        const flushResult = await flushAllTouchedChannels(context.channelsState)(
            context.stdOut,
        )

        expect(valueOrThrow(flushResult)).toBeUndefined()

        expect(context.stdOutRecorder.lines()).toEqual([
            "00:00:00 INFO hello alpha",
        ])

        expect(context.channelsState.state.alpha.lastSize).toBe(
            "00:00:00 INFO hello alpha\n".length,
        )
        expect(context.channelsState.state.alpha.touched).toBe(false)
    })

    it("does not duplicate stdout output on repeated flushes", async () => {
        const context = await fixture.makeContext()
        const moduleScope = fixture.moduleScope("alpha", "/workspace/alpha")

        const writeResult = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                observability.log("hello alpha")
                return value(undefined)
            },
        )

        expect(valueOrThrow(writeResult)).toBeUndefined()

        const firstFlush = await flushAllTouchedChannels(context.channelsState)(context.stdOut)
        const secondFlush = await flushAllTouchedChannels(context.channelsState)(context.stdOut)

        expect(valueOrThrow(firstFlush)).toBeUndefined()
        expect(valueOrThrow(secondFlush)).toBeUndefined()

        expect(context.stdOutRecorder.lines()).toEqual([
            "00:00:00 INFO hello alpha",
        ])

        expect(context.channelsState.state.alpha.touched).toBe(false)
        expect(context.channelsState.state.alpha.lastSize).toBe(
            "00:00:00 INFO hello alpha\n".length,
        )
    })

    it("can write and flush multiple modules through real files", async () => {
        const context = await fixture.makeContext()

        const alphaScope = fixture.moduleScope("alpha", "/workspace/alpha")
        const betaScope = fixture.moduleScope("beta", "/workspace/beta")

        expect(valueOrThrow(
            await withModuleObservability(
                context,
                alphaScope,
                async observability => {
                    observability.log("hello alpha")
                    return value(undefined)
                },
            ),
        )).toBeUndefined()

        expect(valueOrThrow(
            await withModuleObservability(
                context,
                betaScope,
                async observability => {
                    observability.log("hello beta")
                    return value(undefined)
                },
            ),
        )).toBeUndefined()

        expect(await fixture.readLog(context, "/workspace/alpha")).toEqual(
            "00:00:00 INFO hello alpha\n",
        )
        expect(await fixture.readLog(context, "/workspace/beta")).toEqual(
            "00:00:00 INFO hello beta\n",
        )

        expect(valueOrThrow(
            await flushAllTouchedChannels(context.channelsState)(context.stdOut),
        )).toBeUndefined()

        expect(context.stdOutRecorder.lines()).toEqual([
            "00:00:00 INFO hello alpha",
            "00:00:00 INFO hello beta",
        ])

        expect(context.channelsState.state.alpha.touched).toBe(false)
        expect(context.channelsState.state.beta.touched).toBe(false)
    })

    it("cleans up temp roots", async () => {
        const context = await fixture.makeContext()
        const root = context.root

        await fs.access(root)

        await fixture.cleanup()

        await expect(fs.access(root)).rejects.toThrow()
    })

    it("expectedRootLog matches recordingObservability output format", async () => {
        const context = await fixture.makeContext()

        context.observability.log("root message")

        expect(context.recording.logs).toEqual([
            fixture.expectedRootLog("root message"),
        ])
    })

    it("supports custom correlation id and temp root prefix", async () => {
        const context = await fixture.makeContext({
            correlationId: "custom-correlation",
            rootPrefix: "custom-node-observability-",
        })

        expect(path.basename(context.root)).toMatch(/^custom-node-observability-/)
        expect(context.observability.correlationId).toEqual("custom-correlation")
    })
    it("fixture low-level syncWriteTo writes real files", async () => {
        const context = await fixture.makeContext()
        const moduleScope = fixture.moduleScope("alpha", "/workspace/alpha")

        const write = syncWriteTo(context.channelsState)(moduleScope)

        write("hello raw\n")

        await waitForAsyncWrites(context.channelsState)

        expect(Object.keys(context.channelsState.state)).toEqual(["alpha"])
        expect(context.channelsState.state.alpha.refs).toEqual([
            fixture.logPath(context, "/workspace/alpha"),
            fixture.sessionPath(context, "/workspace/alpha"),
        ])

        expect(await fixture.readLog(context, "/workspace/alpha")).toEqual("hello raw\n")
        expect(await fixture.readSession(context, "/workspace/alpha")).toEqual("hello raw\n")
    })
})