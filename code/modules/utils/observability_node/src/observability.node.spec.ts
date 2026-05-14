import {mkdir, mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import * as path from "node:path"
import {Readable, Writable} from "node:stream"
import {errorsOrThrow, valueOrThrow} from "@laoban/errors"
import {
    createNodeObservability,
    nodeChannelTc,
    NodeReadChannel,
    NodeRef,
} from "./observability.node"
import {
    DebugConfig,
    fixedTimeService,
    ModuleName,
    ModuleObservabilityScope,
} from "@laoban/observability"

type Purpose = ".log" | ".session"

type RecordingWritable = Writable & {
    writes: string[]
}

const recordingWritable = (): RecordingWritable => {
    const writes: string[] = []

    const channel = new Writable({
        write(chunk, _encoding, callback) {
            writes.push(String(chunk))
            callback()
        },
    }) as RecordingWritable

    channel.writes = writes

    return channel
}

const scope = (
    module: ModuleName,
    directory: string,
): ModuleObservabilityScope => ({
    module,
    directory,
})

const writeRef = async (ref: NodeRef, text: string): Promise<void> => {
    await mkdir(path.dirname(ref), {recursive: true})
    await writeFile(ref, text, "utf8")
}

describe("nodeChannelTc", () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), "laoban-node-channel-"))
    })

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true})
    })

    const makeTc = () =>
        nodeChannelTc<Purpose>({
            keyFrom: (moduleScope: ModuleObservabilityScope) =>
                String(moduleScope.module ?? "<none>"),
            reference: (moduleScope: ModuleObservabilityScope) => (purpose: Purpose): NodeRef =>
                path.join(moduleScope.directory, purpose),
        })

    it("maps module scope and purpose to durable refs", () => {
        const tc = makeTc()

        const alpha = scope("alpha", path.join(dir, "alpha"))
        const none = scope(undefined, path.join(dir, "<none>"))

        expect(tc.keyFrom(alpha)).toBe("alpha")
        expect(tc.keyFrom(none)).toBe("<none>")
        expect(tc.reference(alpha)(".log")).toBe(path.join(dir, "alpha", ".log"))
        expect(tc.reference(none)(".session")).toBe(path.join(dir, "<none>", ".session"))
    })

    it("creates a fresh writable channel when append is false", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")

        await writeRef(ref, "old")

        const channel = valueOrThrow(
            await tc.create(ref, {append: false}),
        )

        expect(valueOrThrow(await tc.write(channel, "new"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        await expect(readFile(ref, "utf8")).resolves.toBe("new")
    })

    it("creates an append writable channel when append is true", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")

        await writeRef(ref, "old")

        const channel = valueOrThrow(
            await tc.create(ref, {append: true}),
        )

        expect(valueOrThrow(await tc.write(channel, "new"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        await expect(readFile(ref, "utf8")).resolves.toBe("oldnew")
    })

    it("creates the parent directory when opening a writable channel", async () => {
        const tc = makeTc()
        const ref = path.join(dir, "missing-parent", "nested", "alpha.log")

        const channel = valueOrThrow(
            await tc.create(ref, {append: false}),
        )

        expect(valueOrThrow(await tc.write(channel, "new"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        expect((await stat(path.dirname(ref))).isDirectory()).toBe(true)
        await expect(readFile(ref, "utf8")).resolves.toBe("new")
    })

    it("writes multiple strings to a writable channel in order", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")

        const channel = valueOrThrow(
            await tc.create(ref, {append: false}),
        )

        expect(valueOrThrow(await tc.write(channel, "one"))).toBeUndefined()
        expect(valueOrThrow(await tc.write(channel, "two"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        await expect(readFile(ref, "utf8")).resolves.toBe("onetwo")
    })

    it("composes writable channels into a lifecycle-neutral fan-out writable", async () => {
        const tc = makeTc()
        const logRef = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")
        const sessionRef = tc.reference(scope("alpha", path.join(dir, "alpha")))(".session")
        const onError = jest.fn()

        const log = valueOrThrow(await tc.create(logRef, {append: false}))
        const session = valueOrThrow(await tc.create(sessionRef, {append: false}))

        const composed = tc.composeWritables([log, session], onError)

        expect(valueOrThrow(await tc.write(composed, "hello"))).toBeUndefined()

        expect(valueOrThrow(await tc.closeWritable(log))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(session))).toBeUndefined()

        await expect(readFile(logRef, "utf8")).resolves.toBe("hello")
        await expect(readFile(sessionRef, "utf8")).resolves.toBe("hello")
        expect(onError).not.toHaveBeenCalled()
    })

    it("returns an error when writing to a closed writable channel", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")

        const channel = valueOrThrow(
            await tc.create(ref, {append: false}),
        )

        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        const result = await tc.write(channel, "after-close")

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "nodeChannel",
                message: "Failed to write to channel",
                context: {error: "Error [ERR_STREAM_WRITE_AFTER_END]: write after end"},
            },
        ])
    })

    it("closes a readable channel", async () => {
        const tc = makeTc()

        const source = new Readable({
            read() {
                this.push("hello")
            },
        }) as NodeReadChannel

        expect(source.destroyed).toBe(false)

        expect(valueOrThrow(await tc.closeReadable(source))).toBeUndefined()

        expect(source.destroyed).toBe(true)
    })

    it("sends durable content from marker to a write channel and returns the new marker", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")
        const out = recordingWritable()

        await writeRef(ref, "hello world")

        const result = await tc.sendFromRefToWrite(ref, 6, out)

        expect(valueOrThrow(result)).toBe(Buffer.byteLength("hello world", "utf8"))
        expect(out.writes.join("")).toBe("world")
    })

    it("waits for a slow writable channel while sending durable content", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")
        const writes: string[] = []
        const events: string[] = []

        const out = new Writable({
            write(chunk, _encoding, callback) {
                events.push("write-start")
                setTimeout(() => {
                    writes.push(String(chunk))
                    events.push("write-end")
                    callback()
                }, 5)
            },
        })

        await writeRef(ref, "hello world")

        const result = await tc.sendFromRefToWrite(ref, 0, out)

        events.push("after-send")

        expect(valueOrThrow(result)).toBe(Buffer.byteLength("hello world", "utf8"))
        expect(writes.join("")).toBe("hello world")
        expect(events).toEqual(["write-start", "write-end", "after-send"])
    })

    it("sends nothing and returns current marker when from is at the durable end", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")
        const out = recordingWritable()

        await writeRef(ref, "hello")

        const marker = Buffer.byteLength("hello", "utf8")
        const result = await tc.sendFromRefToWrite(ref, marker, out)

        expect(valueOrThrow(result)).toBe(marker)
        expect(out.writes).toEqual([])
    })

    it("uses byte markers for utf8 content", async () => {
        const tc = makeTc()
        const ref = tc.reference(scope("alpha", path.join(dir, "alpha")))(".log")
        const out = recordingWritable()
        const prefix = "你好"
        const suffix = "world"

        await writeRef(ref, `${prefix}${suffix}`)

        const from = Buffer.byteLength(prefix, "utf8")
        const result = await tc.sendFromRefToWrite(ref, from, out)

        expect(valueOrThrow(result)).toBe(Buffer.byteLength(`${prefix}${suffix}`, "utf8"))
        expect(out.writes.join("")).toBe(suffix)
    })

    it("returns an error when sendFromRefToWrite is given a missing ref", async () => {
        const tc = makeTc()
        const ref = path.join(dir, "missing.log")
        const out = recordingWritable()

        const result = await tc.sendFromRefToWrite(ref, 0, out)

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "nodeChannel",
                message: `Failed to send durable content from ${ref}`,
                context: {
                    error: "ref does not exist",
                },
            },
        ])
    })

    it("returns an error when create is given a directory ref", async () => {
        const tc = makeTc()

        const result = await tc.create(dir, {append: false})

        const actual = errorsOrThrow(result)
        const errorContext = actual.map(e => (e.context as any).error)
        const errorMessages = actual.map(e => e.message)
        const withoutErrors = actual.map(e => ({...e, context: undefined, message: undefined}))

        expect(withoutErrors).toEqual([
            {
                kind: "nodeChannel",
            },
        ])

        for (const e of errorContext)
            expect(e).toContain("Error: EISDIR: illegal operation on a directory, open")

        for (const e of errorMessages)
            expect(e).toContain("Failed to create write channel for ")
    })
})

describe("createNodeObservability", () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), "laoban-node-observability-"))
    })

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true})
    })

    const reference = (moduleScope: ModuleObservabilityScope) => (purpose: Purpose): NodeRef =>
        path.join(moduleScope.directory, purpose)

    const debugConfig: DebugConfig = {
        exec: {
            debug: [],
        },
        template: {
            debug: [["parse"]],
        },
    }

    it("creates a root observability writing to the supplied channel", async () => {
        const channel = recordingWritable()
        const onError = jest.fn()
        const rootScope = scope(undefined, dir)

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            moduleScope: rootScope,
            timeService: fixedTimeService(100),
            channel,
            purposes: [".log", ".session"],
            reference,
            onError,
        })

        await (created.observability.log("root", "started") as any as Promise<void>)

        expect(created.observability.moduleScope).toBe(rootScope)
        expect(channel.writes).toEqual([
            "00:00:00 INFO root started\n",
        ])
        expect(created.channelsState.purposes).toEqual([".log", ".session"])

        const alphaScope = scope("alpha", path.join(dir, "alpha"))
        expect(created.tc.reference(alphaScope)(".log")).toBe(path.join(dir, "alpha", ".log"))
        expect(onError).not.toHaveBeenCalled()
    })

    it("creates module observability sharing the same channel state", async () => {
        const channel = recordingWritable()
        const onError = jest.fn()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            channel,
            purposes: [".log", ".session"],
            reference,
            onError,
        })

        const alphaScope = scope("alpha", path.join(dir, "alpha"))
        const alpha = valueOrThrow(await created.withModule(alphaScope))

        await (alpha.log("module", "started") as any as Promise<void>)

        expect(alpha.moduleScope).toBe(alphaScope)
        expect(alpha.writable).toBeDefined()
        expect(Object.keys(created.channelsState.state)).toEqual(["alpha"])
        expect(created.channelsState.state.alpha.refs).toEqual([
            path.join(dir, "alpha", ".log"),
            path.join(dir, "alpha", ".session"),
        ])

        await alpha.close()

        expect(await readFile(path.join(dir, "alpha", ".log"), "utf8")).toBe("00:00:00 INFO module started\n")
        expect(await readFile(path.join(dir, "alpha", ".session"), "utf8")).toBe("00:00:00 INFO module started\n")
        expect(channel.writes).toEqual([])
    })

    it("flushes module observability to an injected write channel", async () => {
        const channel = recordingWritable()
        const onError = jest.fn()
        const out = recordingWritable()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            channel,
            purposes: [".log", ".session"],
            reference,
            onError,
        })

        const alpha = valueOrThrow(
            await created.withModule(scope("alpha", path.join(dir, "alpha"))),
        )

        await (alpha.log("one") as any as Promise<void>)
        await alpha.close()

        expect(valueOrThrow(await alpha.flush(out))).toBeUndefined()

        expect(out.writes.join("")).toBe("00:00:00 INFO one\n")
        expect(created.channelsState.state.alpha.lastSize).toBe(
            Buffer.byteLength("00:00:00 INFO one\n", "utf8"),
        )
        expect(created.channelsState.state.alpha.channels).toBeUndefined()
    })

    it("uses debug config for root and module observability", async () => {
        const channel = recordingWritable()
        const onError = jest.fn()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            debugConfig,
            channel,
            purposes: [".log"],
            reference,
            onError,
        })

        await (created.observability.debug(["exec"], "debug", "root debug") as any as Promise<void>)

        const hiddenLevel = created.observability.debug(["exec"], "info", "hidden level") as any
        if (hiddenLevel) await hiddenLevel

        const hiddenChild = created.observability.debug(["template", "render"], "debug", "hidden child") as any
        if (hiddenChild) await hiddenChild

        await (created.observability.debug(["template", "parse"], "debug", "root parse") as any as Promise<void>)

        const alpha = valueOrThrow(
            await created.withModule(scope("alpha", path.join(dir, "alpha"))),
        )

        await (alpha.debug(["exec"], "debug", "module debug") as any as Promise<void>)
        await (alpha.debug(["template", "parse"], "debug", "module parse") as any as Promise<void>)
        await alpha.close()

        expect(channel.writes).toEqual([
            "00:00:00 DEBUG [exec] root debug\n",
            "00:00:00 DEBUG [template:parse] root parse\n",
        ])
        expect(await readFile(path.join(dir, "alpha", ".log"), "utf8")).toBe(
            [
                "00:00:00 DEBUG [exec] module debug\n",
                "00:00:00 DEBUG [template:parse] module parse\n",
            ].join(""),
        )
    })

    it("enables child debug names when the whole area is enabled", async () => {
        const channel = recordingWritable()
        const onError = jest.fn()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            debugConfig: {
                script: {
                    debug: [],
                },
            },
            channel,
            purposes: [".log"],
            reference,
            onError,
        })

        await (created.observability.debug(["script"], "debug", "script root") as any as Promise<void>)
        await (created.observability.debug(["script", "type1"], "debug", "script type1") as any as Promise<void>)
        await (created.observability.debug(["script", "type2"], "debug", "script type2") as any as Promise<void>)

        expect(channel.writes).toEqual([
            "00:00:00 DEBUG [script] script root\n",
            "00:00:00 DEBUG [script:type1] script type1\n",
            "00:00:00 DEBUG [script:type2] script type2\n",
        ])
    })

    it("does not enable unconfigured sibling child debug names", async () => {
        const channel = recordingWritable()
        const onError = jest.fn()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            debugConfig: {
                template: {
                    debug: [["parse"]],
                },
            },
            channel,
            purposes: [".log"],
            reference,
            onError,
        })

        const hiddenRoot = created.observability.debug(["template"], "debug", "hidden root") as any
        if (hiddenRoot) await hiddenRoot

        await (created.observability.debug(["template", "parse"], "debug", "parse") as any as Promise<void>)

        const hiddenRender = created.observability.debug(["template", "render"], "debug", "hidden render") as any
        if (hiddenRender) await hiddenRender

        expect(channel.writes).toEqual([
            "00:00:00 DEBUG [template:parse] parse\n",
        ])
    })
})