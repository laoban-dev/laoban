import {
    asyncWriteTo,
    ChannelTc,
    emptyChannelState,
    flush,
    getOrCreateChannels,
    Marker,
    syncWriteTo,
    Write,
} from "./write.with.flush"
import {Errors, ErrorsOr, isErrors, value} from "@laoban/errors"
import {ModuleName} from "./observability"

type Purpose = ".log" | ".session"
type Ref = string

type ReadChannel = never

type WriteChannel = {
    ref: Ref
    writes: string[]
    closed?: boolean
}

const errors = (...messages: string[]): Errors =>
    ({
        errors: messages.map(message => ({message})),
    } as any)

const failure = <T>(...messages: string[]): ErrorsOr<T> =>
    errors(...messages) as ErrorsOr<T>

function makeTc(overrides?: Partial<ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>>) {
    const channelsByRef: Record<string, WriteChannel[]> = {}
    const durableByRef: Record<string, string> = {}
    const projectedByRef: Record<string, string> = {}

    const tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref> = {
        keyFrom: jest.fn((moduleName: ModuleName) => String(moduleName ?? "<none>")),
        reference: jest.fn((moduleName: ModuleName) => (purpose: Purpose) =>
            `${String(moduleName ?? "<none>")}/${purpose}`
        ),
        create: jest.fn(async (ref: Ref, options) => {
            if (!options.append) durableByRef[ref] = ""

            const channel: WriteChannel = {ref, writes: []}
            channelsByRef[ref] = [...(channelsByRef[ref] ?? []), channel]
            return value(channel)
        }),
        write: jest.fn(async (channel: WriteChannel, text: string) => {
            channel.writes.push(text)
            durableByRef[channel.ref] = (durableByRef[channel.ref] ?? "") + text
            return value(undefined)
        }),
        closeReadable: jest.fn(async (_channel: ReadChannel) =>
            value(undefined)
        ),
        closeWritable: jest.fn(async (channel: WriteChannel) => {
            channel.closed = true
            return value(undefined)
        }),
        sendFromRefToWrite: jest.fn(async (ref: Ref, from, write: Write) => {
            const allText = durableByRef[ref] ?? ""
            const delta = allText.slice(from)
            write(delta)
            projectedByRef[ref] = (projectedByRef[ref] ?? "") + delta
            return value(allText.length)
        }),
        ...overrides,
    }

    return {tc, channelsByRef, durableByRef, projectedByRef}
}

describe("emptyChannelState", () => {
    it("creates an empty mutable channel state with the supplied typeclass, purposes and error handler", () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        expect(state.tc).toBe(tc)
        expect(state.purposes).toEqual([".log", ".session"])
        expect(state.state).toEqual({})
        expect(state.onError).toBe(onError)
        expect(state.asyncWrites).toEqual(new Set())
    })
})

describe("getOrCreateChannels", () => {
    it("creates one writable channel per purpose on first access using append false", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        const result = await getOrCreateChannels(state, "alpha")

        expect(isErrors(result)).toBe(false)
        if (isErrors(result)) throw new Error("expected success")

        expect(result.value.map(c => c.ref)).toEqual(["alpha/.log", "alpha/.session"])
        expect(tc.keyFrom).toHaveBeenCalledWith("alpha")
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.reference).toHaveBeenCalledWith("alpha")
        expect(tc.create).toHaveBeenCalledTimes(2)
        expect(tc.create).toHaveBeenNthCalledWith(
            1,
            "alpha/.log",
            expect.objectContaining({append: false})
        )
        expect(tc.create).toHaveBeenNthCalledWith(
            2,
            "alpha/.session",
            expect.objectContaining({append: false})
        )
        expect(state.state.alpha.refs).toEqual(["alpha/.log", "alpha/.session"])
        expect(state.state.alpha.channels).toBe(result.value)
        expect(state.state.alpha.lastSize).toBe(0)
    })

    it("returns existing open writable channels without recomputing references or recreating channels", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        const first = await getOrCreateChannels(state, "alpha")
        const second = await getOrCreateChannels(state, "alpha")

        expect(isErrors(first)).toBe(false)
        expect(isErrors(second)).toBe(false)
        if (isErrors(first) || isErrors(second)) throw new Error("expected success")

        expect(second.value).toBe(first.value)
        expect(tc.keyFrom).toHaveBeenCalledTimes(2)
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.create).toHaveBeenCalledTimes(2)
    })

    it("reopens writable channels with append true after flush has cleared the open channels", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        const first = await getOrCreateChannels(state, "alpha")
        expect(isErrors(first)).toBe(false)
        if (isErrors(first)) throw new Error("expected success")

        state.state.alpha.channels = undefined

        const second = await getOrCreateChannels(state, "alpha")
        expect(isErrors(second)).toBe(false)
        if (isErrors(second)) throw new Error("expected success")

        expect(second.value).not.toBe(first.value)
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.create).toHaveBeenCalledTimes(4)
        expect(tc.create).toHaveBeenNthCalledWith(
            3,
            "alpha/.log",
            expect.objectContaining({append: true})
        )
        expect(tc.create).toHaveBeenNthCalledWith(
            4,
            "alpha/.session",
            expect.objectContaining({append: true})
        )
    })

    it("uses keyFrom for state identity, while reference still receives the original module name", async () => {
        const {tc} = makeTc({
            keyFrom: jest.fn((_moduleName: ModuleName) => "shared-key"),
            reference: jest.fn((moduleName: ModuleName) => (purpose: Purpose) =>
                `${String(moduleName ?? "<none>")}/${purpose}`
            ),
        })

        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)

        await getOrCreateChannels(state, undefined)
        await getOrCreateChannels(state, null)

        expect(Object.keys(state.state)).toEqual(["shared-key"])
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.reference).toHaveBeenCalledWith(undefined)
        expect(tc.create).toHaveBeenCalledTimes(1)
    })

    it("returns errors when any writable channel creation fails and does not store open channels", async () => {
        const {tc} = makeTc({
            create: jest.fn(async (ref: Ref) =>
                ref.endsWith(".session")
                    ? failure<WriteChannel>("cannot create session")
                    : value({ref, writes: []})
            ),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        const result = await getOrCreateChannels(state, "alpha")

        expect(isErrors(result)).toBe(true)
        expect(state.state.alpha.channels).toBeUndefined()
        expect(tc.create).toHaveBeenCalledTimes(2)
    })
})

describe("asyncWriteTo", () => {
    it("writes text to all mirrored writable channels", async () => {
        const {tc, durableByRef} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        await asyncWriteTo(state)("alpha")("hello")

        expect(tc.write).toHaveBeenCalledTimes(2)
        expect(tc.write).toHaveBeenNthCalledWith(
            1,
            state.state.alpha.channels?.[0],
            "hello"
        )
        expect(tc.write).toHaveBeenNthCalledWith(
            2,
            state.state.alpha.channels?.[1],
            "hello"
        )
        expect(state.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["hello"],
            ["hello"],
        ])
        expect(durableByRef).toEqual({
            "alpha/.log": "hello",
            "alpha/.session": "hello",
        })
        expect(onError).not.toHaveBeenCalled()
    })

    it("reuses existing writable channels on subsequent writes", async () => {
        const {tc, durableByRef} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        await asyncWriteTo(state)("alpha")("one")
        await asyncWriteTo(state)("alpha")("two")

        expect(tc.create).toHaveBeenCalledTimes(2)
        expect(tc.write).toHaveBeenCalledTimes(4)
        expect(state.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["one", "two"],
            ["one", "two"],
        ])
        expect(durableByRef).toEqual({
            "alpha/.log": "onetwo",
            "alpha/.session": "onetwo",
        })
    })

    it("routes writable channel write errors to onError", async () => {
        const {tc} = makeTc({
            write: jest.fn(async (channel: WriteChannel, text: string) =>
                channel.ref.endsWith(".session")
                    ? failure<void>(`failed ${text}`)
                    : value(undefined)
            ),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        await asyncWriteTo(state)("alpha")("hello")

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                errors: expect.any(Array),
            })
        )
    })

    it("routes unexpected exceptions to onError", async () => {
        const {tc} = makeTc({
            write: jest.fn(async () => {
                throw new Error("boom")
            }),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)

        await asyncWriteTo(state)("alpha")("hello")

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                errors: expect.any(Array),
            })
        )
    })
})

describe("syncWriteTo", () => {
    it("returns a Write that starts the async durable write path", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)

        const write = syncWriteTo(state)("alpha")

        await (write("hello") as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(2)
        expect(tc.write).toHaveBeenNthCalledWith(
            1,
            state.state.alpha.channels?.[0],
            "hello"
        )
        expect(tc.write).toHaveBeenNthCalledWith(
            2,
            state.state.alpha.channels?.[1],
            "hello"
        )
        expect(onError).not.toHaveBeenCalled()
    })

    it("tracks outstanding writes so flush waits before closing and projecting", async () => {
        let releaseWrite!: () => void
        let writeIsBlocked!: Promise<void>

        writeIsBlocked = new Promise<void>(resolveBlocked => {
            const {tc} = makeTc()
        })

        let resolveWriteIsBlocked!: () => void
        writeIsBlocked = new Promise<void>(resolve => {
            resolveWriteIsBlocked = resolve
        })

        const {tc} = makeTc({
            write: jest.fn(async (channel: WriteChannel, text: string) => {
                resolveWriteIsBlocked()

                await new Promise<void>(resolve => {
                    releaseWrite = resolve
                })

                channel.writes.push(text)
                return value(undefined)
            }),
            sendFromRefToWrite: jest.fn(async (_ref: Ref, _from: Marker, write: Write) => {
                write("projected")
                return value(9)
            }),
        })

        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out = jest.fn()

        const write = syncWriteTo(state)("alpha")
        write("hello")

        await writeIsBlocked

        const flushPromise = flush(state)(out)

        expect(tc.closeWritable).not.toHaveBeenCalled()
        expect(tc.sendFromRefToWrite).not.toHaveBeenCalled()

        releaseWrite()

        const result = await flushPromise

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).toHaveBeenCalledTimes(1)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(1)
        expect(out).toHaveBeenCalledWith("projected")
    })
    it("routes async failures through onError rather than throwing from the Write", async () => {
        const {tc} = makeTc({
            write: jest.fn(async () => failure<void>("nope")),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)

        const write = syncWriteTo(state)("alpha")

        await expect(
            write("hello") as Promise<void>
        ).resolves.toBeUndefined()

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                errors: expect.any(Array),
            })
        )
    })
})

describe("flush", () => {
    it("does nothing when there are no purposes", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [], onError)
        const out = jest.fn()

        const result = await flush(state)(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).not.toHaveBeenCalled()
        expect(tc.sendFromRefToWrite).not.toHaveBeenCalled()
        expect(out).not.toHaveBeenCalled()
    })

    it("flushes only states with open writable channels", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out = jest.fn()

        await asyncWriteTo(state)("alpha")("hello")
        state.state.beta = {
            refs: ["beta/.log", "beta/.session"],
            lastSize: 0,
            channels: undefined,
        }

        const result = await flush(state)(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).toHaveBeenCalledTimes(2)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(1)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledWith("alpha/.log", 0, out)
        expect(out).toHaveBeenCalledWith("hello")
        expect(state.state.alpha.channels).toBeUndefined()
        expect(state.state.beta.channels).toBeUndefined()
    })

    it("uses the first ref as the representative durable source and advances lastSize", async () => {
        const {tc} = makeTc({
            sendFromRefToWrite: jest.fn(async (_ref: Ref, _from: number, write: Write) => {
                write("delta")
                return value(5)
            }),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out = jest.fn()

        await asyncWriteTo(state)("alpha")("hello")

        const result = await flush(state)(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledWith("alpha/.log", 0, out)
        expect(out).toHaveBeenCalledWith("delta")
        expect(state.state.alpha.lastSize).toBe(5)
        expect(state.state.alpha.channels).toBeUndefined()
    })

    it("projects only newly durable content after the previous marker", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out = jest.fn()

        await asyncWriteTo(state)("alpha")("one")
        await flush(state)(out)

        await asyncWriteTo(state)("alpha")("two")
        await flush(state)(out)

        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(1, "alpha/.log", 0, out)
        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(2, "alpha/.log", 3, out)
        expect(out).toHaveBeenNthCalledWith(1, "one")
        expect(out).toHaveBeenNthCalledWith(2, "two")
        expect(state.state.alpha.lastSize).toBe(6)
    })

    it("reopens writable channels in append mode after a successful flush", async () => {
        const {tc, durableByRef} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out = jest.fn()

        await asyncWriteTo(state)("alpha")("one")
        await flush(state)(out)
        await asyncWriteTo(state)("alpha")("two")

        expect(tc.create).toHaveBeenCalledTimes(2)
        expect(tc.create).toHaveBeenNthCalledWith(
            1,
            "alpha/.log",
            expect.objectContaining({append: false})
        )
        expect(tc.create).toHaveBeenNthCalledWith(
            2,
            "alpha/.log",
            expect.objectContaining({append: true})
        )
        expect(durableByRef["alpha/.log"]).toBe("onetwo")
    })

    it("does not advance lastSize or clear channels if projection fails", async () => {
        const {tc} = makeTc({
            sendFromRefToWrite: jest.fn(async () => failure<Marker>("projection failed")),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out = jest.fn()

        await asyncWriteTo(state)("alpha")("hello")

        const result = await flush(state)(out)

        expect(isErrors(result)).toBe(true)
        expect(state.state.alpha.lastSize).toBe(0)
        expect(state.state.alpha.channels).toBeDefined()
    })

    it("closes all mirrored writable channels before projecting from the representative ref", async () => {
        const order: string[] = []

        const {tc} = makeTc({
            closeWritable: jest.fn(async (channel: WriteChannel) => {
                order.push(`close:${channel.ref}`)
                channel.closed = true
                return value(undefined)
            }),
            sendFromRefToWrite: jest.fn(async (ref: Ref, _from: Marker, write: Write) => {
                order.push(`project:${ref}`)
                write("hello")
                return value(5)
            }),
        })

        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out = jest.fn()

        await asyncWriteTo(state)("alpha")("hello")

        const result = await flush(state)(out)

        expect(isErrors(result)).toBe(false)
        expect(order).toEqual([
            "close:alpha/.log",
            "close:alpha/.session",
            "project:alpha/.log",
        ])
    })
})