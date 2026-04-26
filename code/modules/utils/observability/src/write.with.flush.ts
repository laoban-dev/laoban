import {
    Errors,
    ErrorsOr,
    flatMapErrorsOrK,
    isErrors,
    makeErrorFromException,
    mapArrayK,
    mapErrorsOr,
    value
} from "@laoban/errors"
import {ModuleName} from "./observability";

export type ModuleKey = string

/**
 * A byte position in a durable channel.
 *
 * For the default Node implementation this will be a byte offset in a file.
 * The important contract is that markers are stable positions in the durable
 * representation, not character indexes.
 */
export type Marker = number

/**
 * A simple text sink.
 *
 * This is used when data read from a durable reference needs to be projected
 * somewhere else, for example to standard output during a flush.
 */
export type Write = (msg: string) => void

/**
 * Callback for channel-level or asynchronous write/flush errors.
 *
 * This is needed for runtimes such as Node where streams may report errors
 * asynchronously, outside the original create/write/flush call.
 */
export type ErrorsFn = (e: Errors) => void

/**
 * Options used when creating/opening a writable channel.
 */
export type CreateOptions = {
    /**
     * When true, open the channel for appending to an existing durable target.
     * When false, create/open it as a fresh target according to the concrete
     * implementation's rules.
     */
    append: boolean
}

/**
 * Typeclass for runtime-specific durable channels.
 *
 * Purpose is the logical reason for the channel, such as "log" or "session".
 * The core code does not know or care what purposes exist.
 *
 * Ref is a durable reference to the target. In the default Node implementation
 * this is likely to be a file name.
 *
 * ReadChannel is an opened runtime object that can be read from. In Node this
 * may be a Readable stream, such as child-process stdout.
 *
 * WriteChannel is an opened runtime object that can be written to and closed.
 * In Node this may be a Writable stream or file handle.
 */
export type ChannelTc<Purpose, ReadChannel, WriteChannel, Ref> = {

    /**
     * Convert a logical purpose into a durable reference.
     *
     * For Node this will usually resolve a purpose to a file name. Keeping this
     * generic allows the same business logic to work with other runtimes.
     */
    reference: (moduleName: ModuleName) => (purpose: Purpose,) => Ref

    /**
     * Convert the Observability module name into a stable key for the shared
     * mutable state map.
     *
     * This is for cache/state identity only. Durable references are still derived
     * from the original ModuleName via reference(...), and are only computed when
     * channels need to be opened.
     */
    keyFrom: (moduleName: ModuleName) => ModuleKey

    /**
     * Create or open a writable channel for the durable reference.
     *
     * The append flag controls whether this is an append/open-existing style
     * operation or a create/fresh-open style operation.
     */
    create: (ref: Ref, options: CreateOptions) => Promise<ErrorsOr<WriteChannel>>

    /**
     * Write text to an open writable channel.
     *
     * The concrete implementation owns encoding details. The intended default
     * for file-backed implementations is UTF-8.
     */
    write: (channel: WriteChannel, text: string) => Promise<ErrorsOr<void>>

    /**
     * Pipe all data from a readable channel into an open writable channel.
     *
     * This transfers data only. The caller remains responsible for lifecycle:
     * closeReadable for the source if the caller owns it, and closeWritable for
     * the target when the durable write boundary is complete.
     *
     * This is used for streamed process output, for example wiring stdout from
     * a child process into durable log/session append channels.
     */
    pipeTo: (source: ReadChannel, target: WriteChannel) => Promise<ErrorsOr<void>>

    /**
     * Close/release a readable channel.
     *
     * For Node this will usually destroy or otherwise release a Readable stream.
     * This is separate from closeWritable because readable and writable streams
     * have different lifecycle semantics.
     */
    closeReadable: (channel: ReadChannel) => Promise<ErrorsOr<void>>

    /**
     * Close/release a writable channel.
     *
     * For Node this will usually end a Writable stream and wait until buffered
     * data has been flushed. Flush logic uses this as a synchronization barrier
     * before projecting newly durable content from the representative reference.
     */
    closeWritable: (channel: WriteChannel) => Promise<ErrorsOr<void>>

    /**
     * Send durable content from the supplied marker to the current durable end
     * to the supplied text sink, then return the new marker.
     *
     * This is the core flush projection operation. The implementation owns the
     * runtime-specific details:
     * - determine the current durable end
     * - read the durable range [from, end)
     * - decode/project that range to write
     * - close/release any temporary read resources before resolving
     *
     * The returned marker must be the durable position up to which content has
     * been projected. For file-backed implementations this is usually the file
     * size in bytes observed for this flush.
     */
    sendFromRefToWrite: (ref: Ref, from: Marker, write: Write) => Promise<ErrorsOr<Marker>>

}

/**
 * Convenience alias for runtimes where the same type can be used as both the
 * readable and writable channel type.
 */
export type SameChannelTc<Purpose, Channel, Ref> =
    ChannelTc<Purpose, Channel, Channel, Ref>

/**
 * State for one module's logical output stream.
 *
 * refs/channels are mirrored durable targets. Each write is sent to every
 * channel in the same order. Flush/projection logic uses refs[0] as the
 * representative durable source and lastSize as the logical marker, avoiding
 * duplicate console projection from equivalent durable copies.
 */
export type ChannelState<WriteChannel, Ref> = {
    lastSize: Marker
    refs: Ref[]

    /**
     * Currently open append channels.
     *
     * Undefined means either:
     * - this module has not written yet, or
     * - flush has closed the append channels and the next write should reopen them.
     *
     * Present means this module has open append channels and should be included
     * in the next flush.
     */
    channels?: WriteChannel[]
}

export type ChannelsState<Purpose, ReadChannel, WriteChannel, Ref> = {
    tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>
    purposes: Purpose[]
    state: Record<ModuleKey, ChannelState<WriteChannel, Ref>>
    onError: ErrorsFn
}

/**
 * Convenience alias for runtimes where the same type can be used as both the
 * readable and writable channel type.
 */
export type SameChannelsState<Purpose, Channel, Ref> =
    ChannelsState<Purpose, Channel, Channel, Ref>

export function emptyChannelState<Purpose, ReadChannel, WriteChannel, Ref>(
    tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>,
    purposes: Purpose[],
    onError: ErrorsFn
): ChannelsState<Purpose, ReadChannel, WriteChannel, Ref> {
    return {tc, purposes, state: {}, onError}
}

export async function getOrCreateChannels<Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
    moduleName: ModuleName
): Promise<ErrorsOr<WriteChannel[]>> {
    const {tc, purposes} = channelState
    const key = tc.keyFrom(moduleName)
    const append = channelState.state[key] !== undefined // first time we create/open fresh; after that we append
    const newState: ChannelState<WriteChannel, Ref> = channelState.state[key] || {
        refs: purposes.map(tc.reference(moduleName)), lastSize: 0, channels: undefined
    }
    channelState.state[key] = newState
    if (newState.channels)
        return value(newState.channels);

    return mapErrorsOr(await mapArrayK(newState.refs, ref => tc.create(ref, {append})),
        channels => {
            const result = {...newState, channels,};
            channelState.state[key] = result
            return result.channels
        })

}

export type AsyncWrite = (msg: string) => Promise<void>

export const asyncWriteTo = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>
) =>
    (moduleName: ModuleName,): AsyncWrite =>
        async (text: string,): Promise<void> => {
            try {
                const errorsOr = await flatMapErrorsOrK(await getOrCreateChannels(channelState, moduleName),
                    channels =>
                        mapArrayK(channels, channel =>
                            channelState.tc.write(channel, text)))
                if (isErrors(errorsOr)) channelState.onError(errorsOr)
            } catch (e: unknown) {
                channelState.onError(makeErrorFromException(`asyncWriteTo(${moduleName})`, e))
            }
        }

/**
 * Synchronous Write adapter over the async durable write path.
 *
 * Observability.log/debug remain synchronous. Durable channel writes happen
 * asynchronously, and any failures are routed to onError rather than returned
 * to the caller.
 *
 * This deliberately returns the underlying Promise at runtime even though
 * Write is typed as void. Production callers can ignore it, while tests can
 * await it deterministically.
 */
export const syncWriteTo = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>
) =>
    (moduleName: ModuleName,): Write =>
        (text: string,) => asyncWriteTo(channelState)(moduleName)(text)

/**
 * Pipe a readable channel into every currently-open durable writable channel
 * for the supplied module.
 *
 * This is intended for process output streams. The readable source is supplied
 * by the runtime, while the writable targets are created from this module's
 * configured purposes.
 *
 * The helper closes the readable channel after all pipe operations have
 * completed successfully. It does not close the writable channels; they remain
 * open until flush closes them.
 */
export const pipeTo = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>
) =>
    async (moduleName: ModuleName, source: ReadChannel): Promise<ErrorsOr<unknown>> =>
        flatMapErrorsOrK(await getOrCreateChannels(channelState, moduleName), async channels =>
            flatMapErrorsOrK(await mapArrayK(channels, channel =>
                    channelState.tc.pipeTo(source, channel)),
                async () =>
                    mapErrorsOr(await channelState.tc.closeReadable(source), () => undefined)))

/**
 * Flush all module streams that currently have open append channels.
 *
 * For each touched module:
 * - close all mirrored append channels
 * - use refs[0] as the representative durable source
 * - project durable content from lastSize to the current durable end
 * - store the returned marker as the new lastSize
 * - clear channels so the next write reopens append channels
 *
 * This avoids duplicate output from mirrored durable targets while keeping
 * each durable target up to date through the write path.
 */
export const flush = <Purpose, ReadChannel, WriteChannel, Ref>(
    {tc, state, purposes}: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    async (write: Write): Promise<ErrorsOr<unknown>> => {
        if (purposes.length === 0) return value([])

        const touchedStates = Object.values(state).filter(s => s.channels !== undefined)

        return mapArrayK(touchedStates, async s =>
            flatMapErrorsOrK(await mapArrayK(s.channels ?? [], channel => tc.closeWritable(channel)), async () =>
                mapErrorsOr(await tc.sendFromRefToWrite(s.refs[0], s.lastSize, write), newMarker => {
                        s.lastSize = newMarker
                        s.channels = undefined
                    }
                )
            )
        )
    }