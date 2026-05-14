import {
    ErrorsOr,
    isErrors,
    makeErrorFromException,
    mapErrorsOr,
    sequenceArrayErrorsOrK,
    value,
} from "@laoban/errors"
import {
    CountMetric,
    DurationMetric,
    makeObservability,
    ModuleObservabilityScope,
    nullCountMetric,
    nullDurationMetric,
    Observability,
    ObservabilityContext,
    ObservabilityTarget,
} from "./observability"
import {
    ChannelTc,
    ChannelsState,
    ErrorsFn,
    flush,
    getOrCreateChannels,
    syncWriteTo,
    waitForAsyncWrites,
} from "./write.with.flush"

export type ModuleObservability<WriteChannel> = Observability & {
    /**
     * The composed writable channel used by this module-scoped observability.
     *
     * This is lifecycle-neutral with respect to the underlying durable child
     * channels. The real durable channels are still tracked in ChannelState and
     * closed by closeModuleObservability.
     */
    writable: WriteChannel

    /**
     * Project this module's durable output to a supplied runtime writable
     * channel.
     *
     * This remains in channel-land. The module layer does not know whether the
     * channel is a Node Writable, an in-memory test channel, or something else.
     */
    flush: (out: WriteChannel) => Promise<ErrorsOr<unknown>>

    /**
     * Close the underlying durable child channels for this module.
     *
     * This does not close the composed writable as an owner of durable state.
     * The composed writable is only a fan-out view over the real channels.
     */
    close: () => Promise<ErrorsOr<void>>
}

/**
 * Turn a writable channel into an Observability.
 *
 * This is useful for root/global observability where the target may be stdout
 * or another runtime-provided writable channel.
 *
 * This function does not manage module lifecycle and does not track module
 * touched state. Module-scoped observability should be created through
 * moduleObservability.
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
        write: text => {
            const promise = tc.write(channel, text)
                .then(result => {
                    if (isErrors(result)) onError(result)
                })
                .catch(e => {
                    onError(makeErrorFromException("channelObservability", e))
                })

            return promise
        },
    }

    return makeObservability({
        context,
        target,
        countMetric,
        durationMetric,
    })
}

/**
 * Close the underlying durable writable channels for a module.
 *
 * The composed writable returned by moduleObservability is not the lifecycle
 * owner of the durable resources. The durable child channels are stored in
 * ChannelState.channels and closed here.
 */
export const closeModuleObservability = async <
    Purpose,
    ReadChannel,
    WriteChannel,
    Ref,
>(
    moduleScope: ModuleObservabilityScope,
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
): Promise<ErrorsOr<void>> => {
    try {
        await waitForAsyncWrites(channelsState)

        const key = channelsState.tc.keyFrom(moduleScope)
        const moduleState = channelsState.state[key]

        if (!moduleState?.channels)
            return value(undefined)

        const closeResult = await sequenceArrayErrorsOrK(
            moduleState.channels.map(channel =>
                channelsState.tc.closeWritable(channel),
            ),
        )

        moduleState.channels = undefined

        return mapErrorsOr(closeResult, () => undefined)
    } catch (e) {
        return makeErrorFromException(
            `closeModuleObservability(${String(moduleScope.module)})`,
            e,
            moduleScope,
        )
    }
}

/**
 * Create module-scoped channel-backed observability from shared channel state.
 *
 * This is the key module lifecycle boundary:
 *
 * 1. open/create the module's real durable child channels
 * 2. compose those child channels into one writable fan-out channel
 * 3. build Observability over the composed writable
 * 4. expose flush in channel terms
 * 5. leave closing of the real child channels to closeModuleObservability
 *
 * This deliberately moves channel creation out of the first log/debug write and
 * into module observability creation.
 */
export const moduleObservability = async <
    Purpose,
    ReadChannel,
    WriteChannel,
    Ref,
>(
    context: ObservabilityContext,
    moduleScope: ModuleObservabilityScope,
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
    countMetric: CountMetric = nullCountMetric,
    durationMetric: DurationMetric = nullDurationMetric,
): Promise<ErrorsOr<ModuleObservability<WriteChannel>>> => {
    try {
        const channelsResult = await getOrCreateChannels(
            channelsState,
            moduleScope,
        )

        if (isErrors(channelsResult))
            return channelsResult

        const composed = channelsState.tc.composeWritables(
            channelsResult.value,
            channelsState.onError,
        )

        const target: ObservabilityTarget = {
            write: syncWriteTo(channelsState)(moduleScope)(composed),
        }

        return value({
            ...makeObservability({
                context,
                target,
                countMetric,
                durationMetric,
            }),
            writable: composed,
            flush: flush(channelsState)(moduleScope),
            close: () => closeModuleObservability(moduleScope, channelsState),
        })
    } catch (e) {
        return makeErrorFromException(
            `moduleObservability(${String(moduleScope.module)})`,
            e,
            moduleScope,
        )
    }
}