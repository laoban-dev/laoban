import {
    channelObservability,
    moduleObservability,
} from "./module.observability"
import {ChannelTc, emptyChannelState} from "./write.with.flush"
import {
    defaultObservabilityContext,
    fixedTimeService,
    ModuleName,
    ModuleObservabilityScope,
    nullCountMetric,
    nullDurationMetric,
} from "./observability"
import {DebugConfig} from "./observability.debug"
import {defaultObservabilityWithCorrelationIdTemplates} from "./observability.log"
import {
    Errors,
    ErrorsOr,
    isErrors,
    value,
    valueOrThrow,
} from "@laoban/errors"

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

function makeTc(overrides?: Partial<ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>>) {
    const channelsByRef: Record<string, WriteChannel[]> = {}
    const durableByRef: Record<string, string> = {}

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

        sendFromRefToWrite: jest.fn(async (ref: Ref, from: number, write: WriteChannel) => {
            const allText = durableByRef[ref] ?? ""
            const delta = allText.slice(from)

            write.writes.push(delta)
            durableByRef[write.ref] = (durableByRef[write.ref] ?? "") + delta

            return value(allText.length)
        }),

        ...overrides,
    }

    return {tc, channelsByRef, durableByRef}
}

const context = (
    module: ModuleName = undefined,
    debugConfig: DebugConfig = {},
) => {
    const moduleScope = scope(module)

    return {
        ...defaultObservabilityContext("corr-123", debugConfig, moduleScope),
        timeService: fixedTimeService(100),
    }
}

const contextWithCorrelationIdTemplate = (
    module: ModuleName = undefined,
    debugConfig: DebugConfig = {},
) => ({
    ...context(module, debugConfig),
    observabilityTemplates: defaultObservabilityWithCorrelationIdTemplates,
})

const getValueOrThrow = <T,>(result: ErrorsOr<T>): T => {
    if (isErrors(result)) throw new Error(JSON.stringify(result))
    return result.value
}

describe("channelObservability", () => {
    it("creates an observability that writes rendered log lines to the supplied writable channel", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(context("root"), tc, channel, onError)

        await (obs.log("hello", {a: true}) as any as Promise<void>)

        expect(obs.correlationId).toBe("corr-123")
        expect(obs.moduleScope.module).toBe("root")
        expect(obs.countMetric).toBe(nullCountMetric)
        expect(obs.durationMetric).toBe(nullDurationMetric)
        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(channel.writes).toEqual([
            '00:00:00 INFO hello {"a":true}\n',
        ])
        expect(onError).not.toHaveBeenCalled()
    })

    it("can include correlation id when the correlation-id template is supplied", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(
            contextWithCorrelationIdTemplate("root"),
            tc,
            channel,
            onError,
        )

        await (obs.log("hello", {a: true}) as any as Promise<void>)

        expect(channel.writes).toEqual([
            '00:00:00 INFO [corr-123] hello {"a":true}\n',
        ])
    })

    it("writes rendered debug lines to the supplied writable channel when the whole area is enabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(
            context("root", {
                load: {
                    debug: [],
                },
            }),
            tc,
            channel,
            onError,
        )

        await (obs.debug(["load"], "debug", "loading") as any as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(channel.writes).toEqual([
            "00:00:00 DEBUG [load] loading\n",
        ])
    })

    it("writes rendered child debug lines when the whole area is enabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(
            context("root", {
                script: {
                    debug: [],
                },
            }),
            tc,
            channel,
            onError,
        )

        await (obs.debug(["script", "type1"], "debug", "running type1") as any as Promise<void>)
        await (obs.debug(["script", "type2"], "debug", "running type2") as any as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(2)
        expect(channel.writes).toEqual([
            "00:00:00 DEBUG [script:type1] running type1\n",
            "00:00:00 DEBUG [script:type2] running type2\n",
        ])
    })

    it("writes only configured child debug lines when a child path is enabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(
            context("root", {
                template: {
                    debug: [["parse"]],
                },
            }),
            tc,
            channel,
            onError,
        )

        const rootResult = obs.debug(["template"], "debug", "hidden root") as any
        if (rootResult) await rootResult

        await (obs.debug(["template", "parse"], "debug", "parsing") as any as Promise<void>)
        await (obs.debug(["template", "parse", "tokens"], "debug", "tokens") as any as Promise<void>)

        const renderResult = obs.debug(["template", "render"], "debug", "hidden render") as any
        if (renderResult) await renderResult

        expect(tc.write).toHaveBeenCalledTimes(2)
        expect(channel.writes).toEqual([
            "00:00:00 DEBUG [template:parse] parsing\n",
            "00:00:00 DEBUG [template:parse:tokens] tokens\n",
        ])
    })

    it("does not write debug lines when disabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}

        const obs = channelObservability(
            context("root", {
                load: {
                    info: [],
                },
            }),
            tc,
            channel,
            onError,
        )

        const result = obs.debug(["load"], "debug", "hidden") as any
        if (result) await result

        expect(tc.write).not.toHaveBeenCalled()
        expect(channel.writes).toEqual([])
    })

    it("uses supplied metric functions", () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channel: WriteChannel = {ref: "stdout", writes: []}
        const counts: string[] = []
        const durations: { name: string, durationMs: number }[] = []

        const obs = channelObservability(
            context("root"),
            tc,
            channel,
            onError,
            name => {
                counts.push(name)
            },
            (name, durationMs) => {
                durations.push({name, durationMs})
            },
        )

        obs.countMetric("count.one")
        obs.durationMetric("duration.one", 123)

        expect(counts).toEqual(["count.one"])
        expect(durations).toEqual([{name: "duration.one", durationMs: 123}])
    })
})

describe("moduleObservability", () => {
    it("creates module channels immediately and composes them", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log", ".session"], onError)
        const moduleScope = scope("alpha", "alpha")

        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha"),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

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
        expect(tc.composeWritables).toHaveBeenCalledTimes(1)
        expect(obs.writable.composed).toBe(true)
        expect(obs.writable.children).toEqual(channelsState.state.alpha.channels)
    })

    it("writes rendered log lines through the composed module channel", async () => {
        const {tc, durableByRef} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log", ".session"], onError)
        const moduleScope = scope("alpha", "alpha")

        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha"),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        await (obs.log("hello", 1) as any as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(tc.write).toHaveBeenCalledWith(obs.writable, "00:00:00 INFO hello 1\n")
        expect(channelsState.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["00:00:00 INFO hello 1\n"],
            ["00:00:00 INFO hello 1\n"],
        ])
        expect(durableByRef).toEqual({
            "alpha/.log": "00:00:00 INFO hello 1\n",
            "alpha/.session": "00:00:00 INFO hello 1\n",
        })
        expect(channelsState.state.alpha.touched).toBe(true)
    })

    it("writes debug through the composed module channel when the whole area is enabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)
        const moduleScope = scope("alpha", "alpha")

        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha", {
                    exec: {
                        debug: [],
                    },
                }),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        await (obs.debug(["exec"], "debug", "running") as any as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(tc.write).toHaveBeenCalledWith(obs.writable, "00:00:00 DEBUG [exec] running\n")
        expect(channelsState.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["00:00:00 DEBUG [exec] running\n"],
        ])
        expect(channelsState.state.alpha.touched).toBe(true)
    })

    it("writes child debug through the composed module channel when the whole area is enabled", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)
        const moduleScope = scope("alpha", "alpha")

        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha", {
                    script: {
                        debug: [],
                    },
                }),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        await (obs.debug(["script", "type1"], "debug", "running") as any as Promise<void>)

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(tc.write).toHaveBeenCalledWith(obs.writable, "00:00:00 DEBUG [script:type1] running\n")
        expect(channelsState.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["00:00:00 DEBUG [script:type1] running\n"],
        ])
    })

    it("writes only configured child debug through the composed module channel", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)
        const moduleScope = scope("alpha", "alpha")

        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha", {
                    template: {
                        debug: [["parse"]],
                    },
                }),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        const rootResult = obs.debug(["template"], "debug", "hidden root") as any
        if (rootResult) await rootResult

        await (obs.debug(["template", "parse"], "debug", "parsing") as any as Promise<void>)

        const renderResult = obs.debug(["template", "render"], "debug", "hidden render") as any
        if (renderResult) await renderResult

        expect(tc.write).toHaveBeenCalledTimes(1)
        expect(tc.write).toHaveBeenCalledWith(obs.writable, "00:00:00 DEBUG [template:parse] parsing\n")
        expect(channelsState.state.alpha.channels?.map(c => c.writes)).toEqual([
            ["00:00:00 DEBUG [template:parse] parsing\n"],
        ])
    })

    it("creates module channels even when debug is disabled, but does not write disabled debug", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)
        const moduleScope = scope("alpha", "alpha")

        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha", {
                    exec: {
                        info: [],
                    },
                }),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        const result = obs.debug(["exec"], "debug", "hidden") as any
        if (result) await result

        expect(tc.create).toHaveBeenCalledTimes(1)
        expect(tc.composeWritables).toHaveBeenCalledTimes(1)
        expect(tc.write).not.toHaveBeenCalled()
        expect(channelsState.state.alpha).toBeDefined()
        expect(channelsState.state.alpha.channels?.map(c => c.writes)).toEqual([
            [],
        ])
        expect(channelsState.state.alpha.touched).toBe(false)
    })

    it("flushes using the supplied WriteChannel", async () => {
        const {tc} = makeTc({
            sendFromRefToWrite: jest.fn(async (_ref: Ref, _from: number, write: WriteChannel) => {
                write.writes.push("delta")
                return value(5)
            }),
        })
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log", ".session"], onError)
        const moduleScope = scope("alpha", "alpha")
        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha"),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))
        const out: WriteChannel = {ref: "stdout", writes: []}

        await (obs.log("hello") as any as Promise<void>)
        const result = await obs.flush(out)

        expect(isErrors(result)).toBe(false)
        expect(tc.closeWritable).toHaveBeenCalledTimes(0)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledTimes(1)
        expect(tc.sendFromRefToWrite).toHaveBeenCalledWith("alpha/.log", 0, out)
        expect(out.writes).toEqual(["delta"])
        expect(channelsState.state.alpha.lastSize).toBe(5)
        expect(channelsState.state.alpha.touched).toBe(false)
        expect(channelsState.state.alpha.channels).toBeDefined()
    })

    it("closes real child channels, not the composed writable", async () => {
        const {tc} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log", ".session"], onError)
        const moduleScope = scope("alpha", "alpha")
        const obs = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha"),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        const childChannels = channelsState.state.alpha.channels ?? []

        await (obs.log("hello") as any as Promise<void>)
        const closeResult = await obs.close()

        expect(isErrors(closeResult)).toBe(false)
        expect(tc.closeWritable).toHaveBeenCalledTimes(2)
        expect(tc.closeWritable).toHaveBeenNthCalledWith(1, childChannels[0])
        expect(tc.closeWritable).toHaveBeenNthCalledWith(2, childChannels[1])
        expect(childChannels.map(c => c.closed)).toEqual([true, true])
        expect(obs.writable.closed).toBeUndefined()
        expect(channelsState.state.alpha.channels).toBeUndefined()
    })

    it("reopens real child channels in append mode after close and creates a fresh composed writable", async () => {
        const {tc, durableByRef} = makeTc()
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)
        const moduleScope = scope("alpha", "alpha")

        const first = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha"),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        await (first.log("one") as any as Promise<void>)
        await first.close()

        const out: WriteChannel = {ref: "stdout", writes: []}
        await first.flush(out)

        const second = getValueOrThrow(await moduleObservability(
            {
                ...context("alpha"),
                moduleScope,
            },
            moduleScope,
            channelsState,
        ))

        await (second.log("two") as any as Promise<void>)

        expect(tc.create).toHaveBeenCalledTimes(2)
        expect(tc.create).toHaveBeenNthCalledWith(
            1,
            "alpha/.log",
            expect.objectContaining({append: false}),
        )
        expect(tc.create).toHaveBeenNthCalledWith(
            2,
            "alpha/.log",
            expect.objectContaining({append: true}),
        )
        expect(tc.composeWritables).toHaveBeenCalledTimes(2)
        expect(first.writable).not.toBe(second.writable)
        expect(durableByRef["alpha/.log"]).toBe(
            "00:00:00 INFO one\n00:00:00 INFO two\n",
        )
    })

    it("returns channel creation errors without creating module observability", async () => {
        const createFailure = failure<WriteChannel>("create failed")
        const {tc} = makeTc({
            create: jest.fn(async () => createFailure),
        })
        const onError = jest.fn()
        const channelsState = emptyChannelState(tc, [".log"], onError)
        const moduleScope = scope("alpha", "alpha")

        const result = await moduleObservability(
            {
                ...context("alpha"),
                moduleScope,
            },
            moduleScope,
            channelsState,
        )

        expect(result).toEqual(createFailure)
        expect(tc.composeWritables).not.toHaveBeenCalled()
        expect(tc.write).not.toHaveBeenCalled()
    })
})