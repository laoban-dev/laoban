import {
    asyncWriteTo,
    ChannelTc,
    emptyChannelState,
    flush,
    getOrCreateChannels,
    Marker,
    pipeTo,
    syncWriteTo,
    Write,
} from "./write.with.flush"
import {Errors, ErrorsOr, isErrors, value} from "@laoban/errors"
import {ModuleName} from "./observability"

type Purpose = ".log" | ".session"
type Ref = string

type ReadChannel = {
    name: string
    data: string[]
    closed?: boolean
}

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
    const projectedByRef: Record<string, string> = {}

    const latestChannel = (ref: Ref): WriteChannel | undefined => {
        const channels = channelsByRef[ref] ?? []
        return channels[channels.length - 1]
    }

    const tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref> = {
        keyFrom: jest.fn((moduleName: ModuleName) => String(moduleName ?? "<none>")),
        reference: jest.fn((moduleName: ModuleName) => (purpose: Purpose) =>
            `${String(moduleName ?? "<none>")}/${purpose}`
        ),
        create: jest.fn(async (ref: Ref, _options) => {
            const channel: WriteChannel = {ref, writes: []}
            channelsByRef[ref] = [...(channelsByRef[ref] ?? []), channel]
            return value(channel)
        }),
        write: jest.fn(async (channel: WriteChannel, text: string) => {
            channel.writes.push(text)
            return value(undefined)
        }),
        pipeTo: jest.fn(async (source: ReadChannel, target: WriteChannel) => {
            target.writes.push(...source.data)
            return value(undefined)
        }),
        closeReadable: jest.fn(async (channel: ReadChannel) => {
            channel.closed = true
            return value(undefined)
        }),
        closeWritable: jest.fn(async (channel: WriteChannel) => {
            channel.closed = true
            return value(undefined)
        }),
        sendFromRefToWrite: jest.fn(async (ref: Ref, from, write: Write) => {
            const allText = (latestChannel(ref)?.writes ?? []).join("")
            const delta = allText.slice(from)
            write(delta)
            projectedByRef[ref] = (projectedByRef[ref] ?? "") + delta
            return value(allText.length)
        }),
        ...overrides,
    }

    return {tc, channelsByRef, projectedByRef}
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
        const {tc} = makeTc()
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
        expect(onError).not.toHaveBeenCalled()
    })

    it("reuses existing writable channels on subsequent writes", async () => {
        const {tc} = makeTc()
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

        await (write("hello") as unknown as Promise<void>)

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

    it("routes async failures through onError rather than throwing from the Write", async () => {
        const {tc} = makeTc({
            write: jest.fn(async () => failure<void>("nope")),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)

        const write = syncWriteTo(state)("alpha")

        await expect(
            write("hello") as unknown as Promise<void>
        ).resolves.toBeUndefined()

        expect(onError).toHaveBeenCalledTimes(1)
        expect(onError.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                errors: expect.any(Array),
            })
        )
    })
})

describe("pipeTo", () => {
    it("pipes a readable channel into all mirrored writable channels", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const source: ReadChannel = {name: "stdout", data: ["one", "two"]}

        const result = await pipeTo(state)("alpha", source)

        expect(isErrors(result)).toBe(false)
        expect(tc.create).toHaveBeenCalledTimes(2)
        expect(tc.pipeTo).toHaveBeenCalledTimes(2)
        expect(tc.pipeTo).toHaveBeenNthCalledWith(1, source, state.state.alpha.channels?.[0])
        expect(tc.pipeTo).toHaveBeenNthCalledWith(2, source, state.state.alpha.channels?.[1])
        expect(state.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["one", "two"],
            ["one", "two"],
        ])
        expect(tc.closeReadable).toHaveBeenCalledTimes(1)
        expect(tc.closeReadable).toHaveBeenCalledWith(source)
        expect(source.closed).toBe(true)
    })

    it("does not close the readable channel if piping fails", async () => {
        const {tc} = makeTc({
            pipeTo: jest.fn(async () => failure<void>("pipe failed")),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const source: ReadChannel = {name: "stdout", data: ["one"]}

        const result = await pipeTo(state)("alpha", source)

        expect(isErrors(result)).toBe(true)
        expect(tc.closeReadable).not.toHaveBeenCalled()
        expect(source.closed).toBeUndefined()
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

    it("reopens writable channels in append mode after a successful flush", async () => {
        const {tc} = makeTc()
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
})