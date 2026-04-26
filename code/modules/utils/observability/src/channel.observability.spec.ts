import {
    channelObservability,
    channelObservabilityWithModule,
    writeToChannel,
} from "./channelObservability"
import {ChannelTc, emptyChannelState, Write} from "./write.with.flush"
import {
    defaultObservabilityContext,
    fixedTimeService,
    nullCountMetric,
    nullDurationMetric,
} from "./observability"
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
        sendFromRefToWrite: jest.fn(async (ref: Ref, from: number, write: Write) => {
            const allText = (latestChannel(ref)?.writes ?? []).join("")
            const delta = allText.slice(from)
            write(delta)
            return value(allText.length)
        }),
        ...overrides,
    }

    return {tc, channelsByRef}
}

const context = (
    module: ModuleName = undefined,
    debugLevels = {},
) => ({
    ...defaultObservabilityContext("corr-123", debugLevels, module),
    timeService: fixedTimeService(100),
})

describe("writeToChannel", () => {
    it("turns a writable channel into a Write", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const write = writeToChannel(tc, onError)(channel)

        await (write("hello") as unknown as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(tc.write).toHaveBeenCalledWith(channel, "hello")
        expect(channel.writes).toEqual(["hello"])
        expect(onError).not.toHaveBeenCalled()
    })

    it("routes channel write errors to onError", async () => {
        const {tc} = makeTc({
            write: jest.fn(async () => failure<void>("write failed")),
        })
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const write = writeToChannel(tc, onError)(channel)

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

    it("routes unexpected exceptions to onError", async () => {
        const {tc} = makeTc({
            write: jest.fn(async () => {
                throw new Error("boom")
            }),
        })
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const write = writeToChannel(tc, onError)(channel)

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

describe("channelObservability", () => {
    it("creates an observability that writes rendered log lines to the supplied writable channel", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(context("root"), tc, channel, onError)

        await (obs.log("hello", {a: true}) as unknown as Promise<void>)

        expect(obs.correlationId).toBe("corr-123")
        expect(obs.module).toBe("root")
        expect(obs.countMetric).toBe(nullCountMetric)
        expect(obs.durationMetric).toBe(nullDurationMetric)
        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(channel.writes).toEqual([
            '100 INFO [corr-123] hello {"a":true}',
        ])
        expect(onError).not.toHaveBeenCalled()
    })

    it("writes rendered debug lines to the supplied writable channel when enabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(context("root", {load: ["debug"]}), tc, channel, onError)

        await (obs.debug("load", "debug", "loading") as unknown as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(channel.writes).toEqual([
            "100 DEBUG [corr-123] [load] loading",
        ])
    })

    it("does not write debug lines when disabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(context("root", {load: ["info"]}), tc, channel, onError)

        const result = obs.debug("load", "debug", "hidden") as unknown as Promise<void> | undefined
        if (result) await result

        expect(tc.write).not.toHaveBeenCalled()
        expect(channel.writes).toEqual([])
    })

    it("uses supplied metric functions", () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}
        const counts: string[] = []
        const durations: {name: string, durationMs: number}[] = []

        const obs = channelObservability(
            context("root"),
            tc,
            channel,
            onError,
            name => counts.push(name),
            (name, durationMs) => durations.push({name, durationMs}),
        )

        obs.countMetric("count.one")
        obs.durationMetric("duration.one", 123)

        expect(counts).toEqual(["count.one"])
        expect(durations).toEqual([{name: "duration.one", durationMs: 123}])
    })
})

describe("channelObservabilityWithModule", () => {
    it("creates a module-aware observability that writes rendered log lines to durable module channels", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log", ".session"], onError)

        const obs = channelObservabilityWithModule(context("alpha"), channelsState)

        await (obs.log("hello", 1) as unknown as Promise<void>)

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
        expect(tc.write).toHaveBeenCalledTimes(2)
        expect(channelsState.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["100 INFO [corr-123] hello 1"],
            ["100 INFO [corr-123] hello 1"],
        ])
    })

    it("writes debug through module channels when enabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)

        const obs = channelObservabilityWithModule(
            context("alpha", {exec: ["debug"]}),
            channelsState,
        )

        await (obs.debug("exec", "debug", "running") as unknown as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(channelsState.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["100 DEBUG [corr-123] [exec] running"],
        ])
    })

    it("does not write disabled debug through module channels", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)

        const obs = channelObservabilityWithModule(
            context("alpha", {exec: ["info"]}),
            channelsState,
        )

        const result = obs.debug("exec", "debug", "hidden") as unknown as Promise<void> | undefined
        if (result) await result

        expect(tc.create).not.toHaveBeenCalled()
        expect(tc.write).not.toHaveBeenCalled()
        expect(channelsState.state.alpha).toBeUndefined()
    })

    it("flushes using the supplied Write sink", async () => {
        const {tc} = makeTc({
            sendFromRefToWrite: jest.fn(async (_ref: Ref, _from: number, write: Write) => {
                write("delta")
                return value(5)
            }),
        })
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log", ".session"], onError)
        const obs = channelObservabilityWithModule(context("alpha"), channelsState)
        const out = jest.fn()

        await (obs.log("hello") as unknown as Promise<void>)
        const result = await obs.flush(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).toHaveBeenCalledTimes(2)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(1)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledWith("alpha/.log", 0, out)
        expect(out).toHaveBeenCalledWith("delta")
        expect(channelsState.state.alpha.lastSize).toBe(5)
        expect(channelsState.state.alpha.channels).toBeUndefined()
    })

    it("reopens channels in append mode after flush", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)
        const obs = channelObservabilityWithModule(context("alpha"), channelsState)

        await (obs.log("one") as unknown as Promise<void>)
        await obs.flush(jest.fn())
        await (obs.log("two") as unknown as Promise<void>)

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
})