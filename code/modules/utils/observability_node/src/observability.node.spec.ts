import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import * as path from "node:path"
import {Readable, Writable} from "node:stream"
import {errorsOrThrow, valueOrThrow} from "@laoban/errors"
import {
    createNodeObservability,
    nodeChannelTc,
    NodeReadChannel,
    NodeRef,
    NodeWriteChannel,
} from "./observability.node"
import {fixedTimeService, ModuleName} from "@laoban/observability"

type Purpose = ".log" | ".session"

class RecordingWritable extends Writable {
    public writes: string[] = []

    _write(chunk: any, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
        this.writes.push(String(chunk))
        callback()
    }
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
            keyFrom: (moduleName: ModuleName) => String(moduleName ?? "<none>"),
            reference: (moduleName: ModuleName) => (purpose: Purpose): NodeRef =>
                path.join(dir, `${String(moduleName ?? "<none>")}${purpose}`),
        })

    it("maps module and purpose to durable refs", () => {
        const tc = makeTc()

        expect(tc.keyFrom("alpha")).toBe("alpha")
        expect(tc.keyFrom(undefined)).toBe("<none>")
        expect(tc.reference("alpha")(".log")).toBe(path.join(dir, "alpha.log"))
        expect(tc.reference(undefined)(".session")).toBe(path.join(dir, "<none>.session"))
    })

    it("creates a fresh writable channel when append is false", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")

        await writeFile(ref, "old")

        const channel = valueOrThrow(
            await tc.create(ref, {append: false})
        )

        expect(valueOrThrow(await tc.write(channel, "new"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        await expect(readFile(ref, "utf8")).resolves.toBe("new")
    })

    it("creates an append writable channel when append is true", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")

        await writeFile(ref, "old")

        const channel = valueOrThrow(
            await tc.create(ref, {append: true})
        )

        expect(valueOrThrow(await tc.write(channel, "new"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        await expect(readFile(ref, "utf8")).resolves.toBe("oldnew")
    })

    it("writes multiple strings to a writable channel in order", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")

        const channel = valueOrThrow(
            await tc.create(ref, {append: false})
        )

        expect(valueOrThrow(await tc.write(channel, "one"))).toBeUndefined()
        expect(valueOrThrow(await tc.write(channel, "two"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(channel))).toBeUndefined()

        await expect(readFile(ref, "utf8")).resolves.toBe("onetwo")
    })

    it("returns an error when writing to a closed writable channel", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")

        const channel = valueOrThrow(
            await tc.create(ref, {append: false})
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

    it("pipes a readable channel into a writable channel without closing the writable", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")
        const source = Readable.from(["one", "two"]) as NodeReadChannel

        const target = valueOrThrow(
            await tc.create(ref, {append: false})
        )

        expect(valueOrThrow(await tc.pipeTo(source, target))).toBeUndefined()
        expect(valueOrThrow(await tc.write(target, "three"))).toBeUndefined()
        expect(valueOrThrow(await tc.closeWritable(target))).toBeUndefined()

        await expect(readFile(ref, "utf8")).resolves.toBe("onetwothree")
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

    it("sends durable content from marker to Write and returns the new marker", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")
        const writes: string[] = []

        await writeFile(ref, "hello world")

        const result = await tc.sendFromRefToWrite(ref, 6, text => writes.push(text))

        expect(valueOrThrow(result)).toBe(Buffer.byteLength("hello world", "utf8"))
        expect(writes.join("")).toBe("world")
    })

    it("sends nothing and returns current marker when from is at the durable end", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")
        const writes: string[] = []

        await writeFile(ref, "hello")

        const marker = Buffer.byteLength("hello", "utf8")
        const result = await tc.sendFromRefToWrite(ref, marker, text => writes.push(text))

        expect(valueOrThrow(result)).toBe(marker)
        expect(writes).toEqual([])
    })

    it("uses byte markers for utf8 content", async () => {
        const tc = makeTc()
        const ref = tc.reference("alpha")(".log")
        const writes: string[] = []
        const prefix = "你好"
        const suffix = "world"

        await writeFile(ref, `${prefix}${suffix}`, "utf8")

        const from = Buffer.byteLength(prefix, "utf8")
        const result = await tc.sendFromRefToWrite(ref, from, text => writes.push(text))

        expect(valueOrThrow(result)).toBe(Buffer.byteLength(`${prefix}${suffix}`, "utf8"))
        expect(writes.join("")).toBe(suffix)
    })

    it("returns an error when sendFromRefToWrite is given a missing ref", async () => {
        const tc = makeTc()
        const ref = path.join(dir, "missing.log")

        const result = await tc.sendFromRefToWrite(ref, 0, jest.fn())

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

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "nodeChannel",
                message: `Failed to create write channel for ${dir}`,
                context: {
                    error: "ref is a directory",
                },
            },
        ])
    })

    it("returns an error when create cannot open because the parent directory is missing", async () => {
        const tc = makeTc()
        const ref = path.join(dir, "missing-parent", "alpha.log")

        const result = await tc.create(ref, {append: false})

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "nodeChannel",
                message: `Failed to create write channel for ${ref}`,
                context: {
                    error: `Error: ENOENT: no such file or directory, open '${ref}'`,
                },
            },
        ])
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

    const reference = (moduleName: ModuleName) => (purpose: Purpose): NodeRef =>
        path.join(dir, `${String(moduleName ?? "<none>")}${purpose}`)

    it("creates a root observability writing to the supplied channel", async () => {
        const channel = new RecordingWritable()
        const onError = jest.fn()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            module: undefined,
            timeService: fixedTimeService(100),
            channel,
            purposes: [".log", ".session"],
            reference,
            onError,
        })

        await (created.observability.log("root", "started") as unknown as Promise<void>)

        expect(channel.writes).toEqual([
            "100 INFO [corr-123] root started",
        ])
        expect(created.channelsState.purposes).toEqual([".log", ".session"])
        expect(created.tc.reference("alpha")(".log")).toBe(path.join(dir, "alpha.log"))
        expect(onError).not.toHaveBeenCalled()
    })

    it("creates module observability sharing the same channel state", async () => {
        const channel = new RecordingWritable()
        const onError = jest.fn()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            channel,
            purposes: [".log", ".session"],
            reference,
            onError,
        })

        const alpha = created.withModule("alpha")

        await (alpha.log("module", "started") as unknown as Promise<void>)

        expect(Object.keys(created.channelsState.state)).toEqual(["alpha"])
        expect(created.channelsState.state.alpha.refs).toEqual([
            path.join(dir, "alpha.log"),
            path.join(dir, "alpha.session"),
        ])

        expect(await readFile(path.join(dir, "alpha.log"), "utf8")).toBe("100 INFO [corr-123] module started")
        expect(await readFile(path.join(dir, "alpha.session"), "utf8")).toBe("100 INFO [corr-123] module started")
        expect(channel.writes).toEqual([])
    })

    it("flushes module observability to an injected Write", async () => {
        const channel = new RecordingWritable()
        const onError = jest.fn()
        const out: string[] = []

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            channel,
            purposes: [".log", ".session"],
            reference,
            onError,
        })

        const alpha = created.withModule("alpha")

        await (alpha.log("one") as unknown as Promise<void>)
        await alpha.flush(text => out.push(text))

        expect(out.join("")).toBe("100 INFO [corr-123] one")
        expect(created.channelsState.state.alpha.lastSize).toBe(
            Buffer.byteLength("100 INFO [corr-123] one", "utf8")
        )
        expect(created.channelsState.state.alpha.channels).toBeUndefined()
    })

    it("uses debug levels for root and module observability", async () => {
        const channel = new RecordingWritable()
        const onError = jest.fn()

        const created = createNodeObservability<Purpose>({
            correlationId: "corr-123",
            timeService: fixedTimeService(100),
            debugLevels: {exec: ["debug"]},
            channel,
            purposes: [".log"],
            reference,
            onError,
        })

        await (created.observability.debug("exec", "debug", "root debug") as unknown as Promise<void>)
        await (created.observability.debug("exec", "info", "hidden") as unknown as Promise<void> | undefined)

        const alpha = created.withModule("alpha")
        await (alpha.debug("exec", "debug", "module debug") as unknown as Promise<void>)

        expect(channel.writes).toEqual([
            "100 DEBUG [corr-123] [exec] root debug",
        ])
        expect(await readFile(path.join(dir, "alpha.log"), "utf8")).toBe(
            "100 DEBUG [corr-123] [exec] module debug"
        )
    })
})