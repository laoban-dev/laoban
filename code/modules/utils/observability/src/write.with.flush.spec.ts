import {
    ChannelTc,
    emptyChannelState,
    flush,
    flushAllTouchedChannels,
    getOrCreateChannels,
    Marker,
    syncWriteTo,
} from "./write.with.flush"
import {Errors, ErrorsOr, isErrors, value} from "@laoban/errors"
import {ModuleName, ModuleObservabilityScope} from "./observability"

type Purpose = ".log" | ".session"
type Ref = string

type ReadChannel = never

type WriteChannel = {
    ref: Ref
    writes: string[]
    closed?: boolean
    composed?: boolean
    children?: WriteChannel[]
}

const errors = (...messages: string[]): Errors =>
    ({
        errors: messages.map(message => ({message})),
    } as any)

const failure = <T>(...messages: string[]): ErrorsOr<T> =>
    errors(...messages) as ErrorsOr<T>

const scope = (
    module: ModuleName,
    directory: string = String(module ?? "<none>"),
): ModuleObservabilityScope => ({
    module,
    directory,
})

const valueOrThrow = <T,>(result: ErrorsOr<T>): T => {
    if (isErrors(result)) throw new Error(JSON.stringify(result))
    return result.value
}

function makeTc(overrides?: Partial<ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>>) {
    const channelsByRef: Record<string, WriteChannel[]> = {}
    const durableByRef: Record<string, string> = {}
    const projectedByRef: Record<string, string> = {}

    const tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref> = {
        keyFrom: jest.fn((moduleScope: ModuleObservabilityScope) =>
            String(moduleScope.module ?? "<none>"),
        ),

        reference: jest.fn((moduleScope: ModuleObservabilityScope) => (purpose: Purpose) =>
            `${moduleScope.directory}/${purpose}`,
        ),

        create: jest.fn(async (ref: Ref, options) => {
            if (!options.append) durableByRef[ref] = ""
            else durableByRef[ref] = durableByRef[ref] ?? ""

            const channel: WriteChannel = {ref, writes: []}
            channelsByRef[ref] = [...(channelsByRef[ref] ?? []), channel]
            return value(channel)
        }),

        write: jest.fn(async (channel: WriteChannel, text: string) => {
            if (channel.composed) {
                for (const child of channel.children ?? []) {
                    child.writes.push(text)
                    durableByRef[child.ref] = (durableByRef[child.ref] ?? "") + text
                }

                channel.writes.push(text)
                return value(undefined)
            }

            channel.writes.push(text)
            durableByRef[channel.ref] = (durableByRef[channel.ref] ?? "") + text
            return value(undefined)
        }),

        composeWritables: jest.fn((channels: WriteChannel[]) => ({
            ref: `composed(${channels.map(c => c.ref).join(",")})`,
            writes: [],
            composed: true,
            children: channels,
        })),

        closeReadable: jest.fn(async (_channel: ReadChannel) =>
            value(undefined),
        ),

        closeWritable: jest.fn(async (channel: WriteChannel) => {
            channel.closed = true
            return value(undefined)
        }),

        sendFromRefToWrite: jest.fn(async (ref: Ref, from: Marker, write: WriteChannel) => {
            const allText = durableByRef[ref] ?? ""
            const delta = allText.slice(from)

            write.writes.push(delta)
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
        const alpha = scope("alpha", "alpha")

        const result = await getOrCreateChannels(state, alpha)

        expect(isErrors(result)).toBe(false)
        if (isErrors(result)) throw new Error("expected success")

        expect(result.value.map(c => c.ref)).toEqual(["alpha/.log", "alpha/.session"])
        expect(tc.keyFrom).toHaveBeenCalledWith(alpha)
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.reference).toHaveBeenCalledWith(alpha)
        expect(tc.create).toHaveBeenCalledTimes(2)
        expect(tc.create).toHaveBeenNthCalledWith(
            1,
            "alpha/.log",
            expect.objectContaining({append: false}),
        )
        expect(tc.create).toHaveBeenNthCalledWith(
            2,
            "alpha/.session",
            expect.objectContaining({append: false}),
        )
        expect(state.state.alpha.refs).toEqual(["alpha/.log", "alpha/.session"])
        expect(state.state.alpha.moduleScope).toEqual(alpha)
        expect(state.state.alpha.channels).toBe(result.value)
        expect(state.state.alpha.lastSize).toBe(0)
        expect(state.state.alpha.touched).toBe(false)
    })

    it("returns existing open writable channels without recomputing references or recreating channels", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const alpha = scope("alpha", "alpha")

        const first = await getOrCreateChannels(state, alpha)
        const second = await getOrCreateChannels(state, alpha)

        expect(isErrors(first)).toBe(false)
        expect(isErrors(second)).toBe(false)
        if (isErrors(first) || isErrors(second)) throw new Error("expected success")

        expect(second.value).toBe(first.value)
        expect(state.state.alpha.moduleScope).toEqual(alpha)
        expect(tc.keyFrom).toHaveBeenCalledTimes(2)
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.create).toHaveBeenCalledTimes(2)
    })

    it("reopens writable channels with append true after channels have been cleared", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const alpha = scope("alpha", "alpha")

        const first = await getOrCreateChannels(state, alpha)
        expect(isErrors(first)).toBe(false)
        if (isErrors(first)) throw new Error("expected success")

        state.state.alpha.channels = undefined

        const second = await getOrCreateChannels(state, alpha)
        expect(isErrors(second)).toBe(false)
        if (isErrors(second)) throw new Error("expected success")

        expect(second.value).not.toBe(first.value)
        expect(state.state.alpha.moduleScope).toEqual(alpha)
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.create).toHaveBeenCalledTimes(4)
        expect(tc.create).toHaveBeenNthCalledWith(
            3,
            "alpha/.log",
            expect.objectContaining({append: true}),
        )
        expect(tc.create).toHaveBeenNthCalledWith(
            4,
            "alpha/.session",
            expect.objectContaining({append: true}),
        )
    })

    it("uses keyFrom for state identity, while reference receives the full module scope", async () => {
        const firstScope = scope(undefined, "first-dir")
        const secondScope = scope(null, "second-dir")

        const {tc} = makeTc({
            keyFrom: jest.fn((_moduleScope: ModuleObservabilityScope) => "shared-key"),
            reference: jest.fn((moduleScope: ModuleObservabilityScope) => (purpose: Purpose) =>
                `${moduleScope.directory}/${purpose}`,
            ),
        })

        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)

        await getOrCreateChannels(state, firstScope)
        await getOrCreateChannels(state, secondScope)

        expect(Object.keys(state.state)).toEqual(["shared-key"])
        expect(state.state["shared-key"].moduleScope).toEqual(firstScope)
        expect(tc.reference).toHaveBeenCalledTimes(1)
        expect(tc.reference).toHaveBeenCalledWith(firstScope)
        expect(tc.create).toHaveBeenCalledTimes(1)
    })

    it("returns errors when any writable channel creation fails and does not store open channels", async () => {
        const {tc} = makeTc({
            create: jest.fn(async (ref: Ref) =>
                ref.endsWith(".session")
                    ? failure<WriteChannel>("cannot create session")
                    : value({ref, writes: []}),
            ),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const alpha = scope("alpha", "alpha")

        const result = await getOrCreateChannels(state, alpha)

        expect(isErrors(result)).toBe(true)
        expect(state.state.alpha.moduleScope).toEqual(alpha)
        expect(state.state.alpha.channels).toBeUndefined()
        expect(tc.create).toHaveBeenCalledTimes(2)
    })
})

describe("syncWriteTo", () => {
    it("returns a Write that writes to the supplied composed channel and tracks the async write", async () => {
        const {tc, durableByRef} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const alpha = scope("alpha", "alpha")

        const childChannels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const composed = state.tc.composeWritables(childChannels, onError)

        const write = syncWriteTo(state)(alpha)(composed)

        await (write("hello") as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(tc.write).toHaveBeenCalledWith(composed, "hello")
        expect(childChannels.map(c => c.writes)).toEqual([
            ["hello"],
            ["hello"],
        ])
        expect(composed.writes).toEqual(["hello"])
        expect(durableByRef).toEqual({
            "alpha/.log": "hello",
            "alpha/.session": "hello",
        })
        expect(state.state.alpha.moduleScope).toEqual(alpha)
        expect(state.state.alpha.touched).toBe(true)
        expect(onError).not.toHaveBeenCalled()
    })

    it("does not create channels itself", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const alpha = scope("alpha", "alpha")

        const channel: WriteChannel = {ref: "manual", writes: []}
        const write = syncWriteTo(state)(alpha)(channel)

        await (write("hello") as Promise<void>)

        expect(tc.create).not.toHaveBeenCalled()
        expect(tc.write).toHaveBeenCalledWith(channel, "hello")
        expect(onError).toHaveBeenCalledTimes(1)
        expect(state.state.alpha).toBeUndefined()
    })

    it("tracks outstanding writes so flush waits before projecting", async () => {
        let releaseWrite!: () => void
        let resolveWriteIsBlocked!: () => void
        const writeIsBlocked = new Promise<void>(resolve => {
            resolveWriteIsBlocked = resolve
        })

        const {tc} = makeTc({
            write: jest.fn(async (channel: WriteChannel, text: string) => {
                resolveWriteIsBlocked()

                await new Promise<void>(resolve => {
                    releaseWrite = resolve
                })

                if (channel.composed) {
                    for (const child of channel.children ?? [])
                        child.writes.push(text)

                    channel.writes.push(text)
                    return value(undefined)
                }

                channel.writes.push(text)
                return value(undefined)
            }),
            sendFromRefToWrite: jest.fn(async (_ref: Ref, _from: Marker, write: WriteChannel) => {
                write.writes.push("projected")
                return value(9)
            }),
        })

        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}
        const alpha = scope("alpha", "alpha")

        const childChannels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const composed = state.tc.composeWritables(childChannels, onError)

        const write = syncWriteTo(state)(alpha)(composed)
        write("hello")

        await writeIsBlocked

        const flushPromise = flush(state)(alpha)(out)

        expect(tc.closeWritable).not.toHaveBeenCalled()
        expect(tc.sendFromRefToWrite).not.toHaveBeenCalled()

        releaseWrite()

        const result = await flushPromise

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).not.toHaveBeenCalled()
        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(1)
        expect(out.writes).toEqual(["projected"])
    })

    it("routes async failures through onError rather than throwing from the Write", async () => {
        const {tc} = makeTc({
            write: jest.fn(async () => failure<void>("nope")),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const alpha = scope("alpha", "alpha")
        const channel: WriteChannel = {ref: "manual", writes: []}

        const write = syncWriteTo(state)(alpha)(channel)

        await expect(
            write("hello") as Promise<void>,
        ).resolves.toBeUndefined()

        expect(onError).toHaveBeenCalledTimes(2)
        expect(onError.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                errors: expect.any(Array),
            }),
        )
        expect(onError.mock.calls[1][0]).toEqual(
            expect.objectContaining({
                errors: expect.any(Array),
            }),
        )
    })
})

describe("flush", () => {
    it("does nothing when there are no purposes", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const result = await flush(state)(scope("alpha", "alpha"))(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).not.toHaveBeenCalled()
        expect(tc.sendFromRefToWrite).not.toHaveBeenCalled()
        expect(out.writes).toEqual([])
    })

    it("does nothing when the requested module has no state", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const result = await flush(state)(scope("missing", "missing"))(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).not.toHaveBeenCalled()
        expect(tc.sendFromRefToWrite).not.toHaveBeenCalled()
        expect(out.writes).toEqual([])
    })

    it("flushes only the requested module state", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const alpha = scope("alpha", "alpha")
        const beta = scope("beta", "beta")

        const alphaChannels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const betaChannels = valueOrThrow(await getOrCreateChannels(state, beta))

        await (syncWriteTo(state)(alpha)(tc.composeWritables(alphaChannels, onError))("hello") as Promise<void>)
        await (syncWriteTo(state)(beta)(tc.composeWritables(betaChannels, onError))("hidden") as Promise<void>)

        const result = await flush(state)(alpha)(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).not.toHaveBeenCalled()
        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(1)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledWith("alpha/.log", 0, out)
        expect(out.writes).toEqual(["hello"])
        expect(state.state.alpha.channels).toBeDefined()
        expect(state.state.beta.channels).toBeDefined()
    })

    it("uses the first ref as the representative durable source and advances lastSize", async () => {
        const {tc} = makeTc({
            sendFromRefToWrite: jest.fn(async (_ref: Ref, _from: number, write: WriteChannel) => {
                write.writes.push("delta")
                return value(5)
            }),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}
        const alpha = scope("alpha", "alpha")

        const channels = valueOrThrow(await getOrCreateChannels(state, alpha))
        await (syncWriteTo(state)(alpha)(tc.composeWritables(channels, onError))("hello") as Promise<void>)

        const result = await flush(state)(alpha)(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledWith("alpha/.log", 0, out)
        expect(out.writes).toEqual(["delta"])
        expect(state.state.alpha.lastSize).toBe(5)
        expect(state.state.alpha.moduleScope).toEqual(alpha)
        expect(state.state.alpha.channels).toBeDefined()
        expect(state.state.alpha.touched).toBe(false)
    })

    it("projects only newly durable content after the previous marker", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}
        const alpha = scope("alpha", "alpha")

        const channels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const composed = tc.composeWritables(channels, onError)

        await (syncWriteTo(state)(alpha)(composed)("one") as Promise<void>)
        await flush(state)(alpha)(out)

        await (syncWriteTo(state)(alpha)(composed)("two") as Promise<void>)
        await flush(state)(alpha)(out)

        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(1, "alpha/.log", 0, out)
        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(2, "alpha/.log", 3, out)
        expect(out.writes).toEqual(["one", "two"])
        expect(state.state.alpha.lastSize).toBe(6)
    })

    it("reuses writable channels after a successful flush", async () => {
        const {tc, durableByRef} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}
        const alpha = scope("alpha", "alpha")

        const channels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const composed = tc.composeWritables(channels, onError)

        await (syncWriteTo(state)(alpha)(composed)("one") as Promise<void>)
        await flush(state)(alpha)(out)
        await (syncWriteTo(state)(alpha)(composed)("two") as Promise<void>)

        expect(tc.create).toHaveBeenCalledTimes(1)
        expect(tc.create).toHaveBeenNthCalledWith(
            1,
            "alpha/.log",
            expect.objectContaining({append: false}),
        )
        expect(durableByRef["alpha/.log"]).toBe("onetwo")
    })

    it("does not advance lastSize or clear touched if projection fails", async () => {
        const {tc} = makeTc({
            sendFromRefToWrite: jest.fn(async () => failure<Marker>("projection failed")),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}
        const alpha = scope("alpha", "alpha")

        const channels = valueOrThrow(await getOrCreateChannels(state, alpha))
        await (syncWriteTo(state)(alpha)(tc.composeWritables(channels, onError))("hello") as Promise<void>)

        const result = await flush(state)(alpha)(out)

        expect(isErrors(result)).toBe(true)
        expect(state.state.alpha.lastSize).toBe(0)
        expect(state.state.alpha.touched).toBe(true)
        expect(state.state.alpha.channels).toBeDefined()
    })

    it("does not close mirrored writable channels before projecting from the representative ref", async () => {
        const order: string[] = []

        const {tc} = makeTc({
            closeWritable: jest.fn(async (channel: WriteChannel) => {
                order.push(`close:${channel.ref}`)
                channel.closed = true
                return value(undefined)
            }),
            sendFromRefToWrite: jest.fn(async (ref: Ref, _from: Marker, write: WriteChannel) => {
                order.push(`project:${ref}`)
                write.writes.push("hello")
                return value(5)
            }),
        })

        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log", ".session"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}
        const alpha = scope("alpha", "alpha")

        const channels = valueOrThrow(await getOrCreateChannels(state, alpha))
        await (syncWriteTo(state)(alpha)(tc.composeWritables(channels, onError))("hello") as Promise<void>)

        const result = await flush(state)(alpha)(out)

        expect(isErrors(result)).toBe(false)
        expect(order).toEqual([
            "project:alpha/.log",
        ])
    })
})

describe("flushAllTouchedChannels", () => {
    it("does nothing when no module states exist", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const result = await flushAllTouchedChannels(state)(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.sendFromRefToWrite).not.toHaveBeenCalled()
        expect(out.writes).toEqual([])
    })

    it("does nothing when module states exist but none are touched", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        await getOrCreateChannels(state, scope("alpha", "alpha"))

        const result = await flushAllTouchedChannels(state)(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.sendFromRefToWrite).not.toHaveBeenCalled()
        expect(out.writes).toEqual([])
    })

    it("flushes every touched module state using its stored module scope", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const alpha = scope("alpha", "alpha-dir")
        const beta = scope("beta", "beta-dir")

        const alphaChannels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const betaChannels = valueOrThrow(await getOrCreateChannels(state, beta))

        await (syncWriteTo(state)(alpha)(tc.composeWritables(alphaChannels, onError))("alpha text") as Promise<void>)
        await (syncWriteTo(state)(beta)(tc.composeWritables(betaChannels, onError))("beta text") as Promise<void>)

        const result = await flushAllTouchedChannels(state)(out)

        expect(isErrors(result)).toBe(false)

        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(2)
        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(1, "alpha-dir/.log", 0, out)
        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(2, "beta-dir/.log", 0, out)

        expect(out.writes).toEqual(["alpha text", "beta text"])

        expect(state.state.alpha.moduleScope).toEqual(alpha)
        expect(state.state.beta.moduleScope).toEqual(beta)
        expect(state.state.alpha.touched).toBe(false)
        expect(state.state.beta.touched).toBe(false)
    })

    it("flushes module states whose channels have been cleared if they are touched", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const alpha = scope("alpha", "alpha")
        const beta = scope("beta", "beta")

        const alphaChannels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const betaChannels = valueOrThrow(await getOrCreateChannels(state, beta))

        await (syncWriteTo(state)(alpha)(tc.composeWritables(alphaChannels, onError))("alpha text") as Promise<void>)
        await (syncWriteTo(state)(beta)(tc.composeWritables(betaChannels, onError))("beta text") as Promise<void>)

        state.state.alpha.channels = undefined

        const result = await flushAllTouchedChannels(state)(out)

        expect(isErrors(result)).toBe(false)

        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(2)
        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(1, "alpha/.log", 0, out)
        expect(tc.sendFromRefToWrite).toHaveBeenNthCalledWith(2, "beta/.log", 0, out)

        expect(out.writes).toEqual(["alpha text", "beta text"])

        expect(state.state.alpha.touched).toBe(false)
        expect(state.state.beta.touched).toBe(false)
    })

    it("skips module states that are not touched", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const alpha = scope("alpha", "alpha")
        const beta = scope("beta", "beta")

        const alphaChannels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const betaChannels = valueOrThrow(await getOrCreateChannels(state, beta))

        await (syncWriteTo(state)(alpha)(tc.composeWritables(alphaChannels, onError))("alpha text") as Promise<void>)
        await (syncWriteTo(state)(beta)(tc.composeWritables(betaChannels, onError))("beta text") as Promise<void>)

        state.state.alpha.touched = false

        const result = await flushAllTouchedChannels(state)(out)

        expect(isErrors(result)).toBe(false)

        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(1)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledWith("beta/.log", 0, out)
        expect(out.writes).toEqual(["beta text"])

        expect(state.state.alpha.lastSize).toBe(0)
        expect(state.state.beta.lastSize).toBe("beta text".length)
        expect(state.state.beta.touched).toBe(false)
    })

    it("aggregates errors from touched module flushes", async () => {
        const {tc} = makeTc({
            sendFromRefToWrite: jest.fn(async (ref: Ref, _from: Marker, write: WriteChannel) => {
                if (ref === "alpha/.log")
                    return failure<Marker>("alpha projection failed")

                write.writes.push("beta text")
                return value(9)
            }),
        })
        const onError = jest.fn()
        const state = emptyChannelState(tc, [".log"], onError)
        const out: WriteChannel = {ref: "stdout", writes: []}

        const alpha = scope("alpha", "alpha")
        const beta = scope("beta", "beta")

        const alphaChannels = valueOrThrow(await getOrCreateChannels(state, alpha))
        const betaChannels = valueOrThrow(await getOrCreateChannels(state, beta))

        await (syncWriteTo(state)(alpha)(tc.composeWritables(alphaChannels, onError))("alpha text") as Promise<void>)
        await (syncWriteTo(state)(beta)(tc.composeWritables(betaChannels, onError))("beta text") as Promise<void>)

        const result = await flushAllTouchedChannels(state)(out)

        expect(isErrors(result)).toBe(true)

        if (isErrors(result))
            expect(result.errors).toEqual([{message: "alpha projection failed"}])

        expect(out.writes).toEqual(["beta text"])
        expect(state.state.alpha.lastSize).toBe(0)
        expect(state.state.beta.lastSize).toBe(9)
    })
})