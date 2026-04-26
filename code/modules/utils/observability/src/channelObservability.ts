import {ErrorsOr, isErrors, makeErrorFromException} from "@laoban/errors";
import {
    CountMetric,
    DurationMetric,
    makeObservability,
    nullCountMetric,
    nullDurationMetric,
    Observability,
    ObservabilityContext,
    ObservabilityTarget,
} from "./observability";
import {
    ChannelTc,
    ChannelsState,
    ErrorsFn,
    flush,
    syncWriteTo,
    Write,
} from "./write.with.flush";

export type ChannelObservability = Observability & {
    flush: (out: Write) => Promise<ErrorsOr<unknown>>
}

/**
 * Turn a writable channel into a Write.
 *
 * This is the direct-channel target adapter. It deliberately returns the
 * underlying Promise at runtime even though Write is typed as void, so tests
 * can await it deterministically.
 */
export const writeToChannel = <Purpose, ReadChannel, WriteChannel, Ref>(
    tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>,
    onError: ErrorsFn,
) =>
    (channel: WriteChannel): Write =>
        (text: string) => {
            const promise = tc.write(channel, text)
                .then(result => {
                    if (isErrors(result)) onError(result)
                })
                .catch(e => {
                    onError(makeErrorFromException("writeToChannel", e))
                })

            return promise as unknown as void
        }

/**
 * Create an Observability that writes directly to an already-open writable
 * channel.
 *
 * This is useful for root/global observability where the target may be stdout
 * or another runtime-provided writable channel.
 */
export const channelObservability = <Purpose, ReadChannel, WriteChannel, Ref>(
    context: ObservabilityContext,
    tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>,
    channel: WriteChannel,
    onError: ErrorsFn,
    countMetric: CountMetric = nullCountMetric,
    durationMetric: DurationMetric = nullDurationMetric,
): Observability => {
    const target: ObservabilityTarget = {
        write: writeToChannel(tc, onError)(channel),
    }

    return makeObservability({
        context,
        target,
        countMetric,
        durationMetric,
    })
}

/**
 * Create a module-aware channel-backed observability from existing shared
 * channel state.
 *
 * log/debug are rebuilt so both go through the module-aware durable channel
 * state. Metrics and rendering context are supplied explicitly rather than
 * inherited from another Observability.
 */
export const channelObservabilityWithModule = <Purpose, ReadChannel, WriteChannel, Ref>(
    context: ObservabilityContext,
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
    countMetric: CountMetric = nullCountMetric,
    durationMetric: DurationMetric = nullDurationMetric,
): ChannelObservability => {
    const target: ObservabilityTarget = {
        write: syncWriteTo(channelsState)(context.module)
    }

    return {
        ...makeObservability({
            context,
            target,
            countMetric,
            durationMetric,
        }),
        flush: flush(channelsState)
    }
}