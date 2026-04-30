import {
    Errors,
    ErrorsOr,
    flatMapErrorsOrK,
    isErrors,
    makeErrorFromException,
    mapArrayK,
    mapErrorsOr,
    value,
} from "@laoban/errors"
import {ModuleObservabilityScope} from "./observability"

export type ModuleKey = string

/**
 * A stable position in a durable channel.
 *
 * For the Node implementation this is normally a byte offset in a file.
 * It is deliberately not a string character index.
 */
export type Marker = number

export type AsyncWriteResult = void | Promise<void>

/**
 * A simple text sink.
 *
 * Used when durable content is projected somewhere else, such as stdout
 * during a flush.
 */
export type Write = (msg: string) => AsyncWriteResult

/**
 * Tracks fire-and-forget writes started by observability.log/debug.
 *
 * Observability writes are synchronous from the caller's point of view, but
 * durable channel writes may still be in flight. Lifecycle boundaries such as
 * close and flush can wait for these promises before touching channels/files.
 */
export type AsyncWritesState = {
    asyncWrites: Set<Promise<void>>
}

export const emptyAsyncWritesState = (): AsyncWritesState => ({
    asyncWrites: new Set(),
})

const isPromiseLike = (value: unknown): value is Promise<void> =>
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"

export const trackAsyncWrite = <S extends AsyncWritesState>(
    state: S,
    result: AsyncWriteResult,
): AsyncWriteResult => {
    if (!isPromiseLike(result)) return result

    state.asyncWrites.add(result)

    result.then(
        () => state.asyncWrites.delete(result),
        () => state.asyncWrites.delete(result),
    )

    return result
}

/**
 * Wait until all writes that have already started have settled.
 *
 * Re-checks in a loop because resolving writes may trigger code paths that add
 * more tracked writes.
 */
export const waitForAsyncWrites = async <S extends AsyncWritesState>(
    state: S,
): Promise<void> => {
    while (state.asyncWrites.size > 0) {
        await Promise.all(
            [...state.asyncWrites].map(p =>
                p.then(
                    () => undefined,
                    () => undefined,
                ),
            ),
        )
    }
}

/**
 * Callback for channel-level or asynchronous write/flush errors.
 *
 * Some runtimes report stream/file errors outside the original call stack, so
 * errors need somewhere explicit to go.
 */
export type ErrorsFn = (e: Errors) => void

export type CreateOptions = {
    /**
     * false means create/open the durable target fresh.
     * true means append to the existing durable target.
     */
    append: boolean
}

/**
 * Runtime-specific durable channel operations.
 *
 * The core observability code knows only that it can open, write, close, and
 * project durable content from a stable marker. Node files/streams are one
 * implementation; tests and other runtimes can provide others.
 */
export type ChannelTc<Purpose, ReadChannel, WriteChannel, Ref> = {
    reference: (moduleScope: ModuleObservabilityScope) => (purpose: Purpose) => Ref
    keyFrom: (moduleScope: ModuleObservabilityScope) => ModuleKey

    create: (ref: Ref, options: CreateOptions) => Promise<ErrorsOr<WriteChannel>>
    write: (channel: WriteChannel, text: string) => Promise<ErrorsOr<void>>

    closeReadable: (channel: ReadChannel) => Promise<ErrorsOr<void>>
    closeWritable: (channel: WriteChannel) => Promise<ErrorsOr<void>>

    /**
     * Project durable content from marker `from` to the current durable end.
     *
     * Returns the new marker. For file-backed implementations this is typically
     * the file size in bytes observed during the projection.
     */
    sendFromRefToWrite: (ref: Ref, from: Marker, write: Write) => Promise<ErrorsOr<Marker>>
}

export type SameChannelTc<Purpose, Channel, Ref> =
    ChannelTc<Purpose, Channel, Channel, Ref>

/**
 * State for one module's mirrored durable output.
 *
 * refs are the durable targets, for example ".log" and ".session".
 * channels are the currently open writable handles for those refs.
 *
 * `channels` is lifecycle state only. It is opened by writes and closed by
 * module observability lifecycle code. It is not used to decide whether flush
 * should project content.
 *
 * `lastSize` is the projection marker for refs[0], the representative durable
 * source used during flush. Mirrored refs receive the same writes, but only one
 * ref is projected to stdout to avoid duplicate output.
 */
export type ChannelState<WriteChannel, Ref> = {
    lastSize: Marker
    refs: Ref[]
    channels?: WriteChannel[]
}

export type ChannelsState<Purpose, ReadChannel, WriteChannel, Ref> =
    AsyncWritesState & {
    tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>
    purposes: Purpose[]
    state: Record<ModuleKey, ChannelState<WriteChannel, Ref>>
    onError: ErrorsFn
}

export type SameChannelsState<Purpose, Channel, Ref> =
    ChannelsState<Purpose, Channel, Channel, Ref>

export function emptyChannelState<Purpose, ReadChannel, WriteChannel, Ref>(
    tc: ChannelTc<Purpose, ReadChannel, WriteChannel, Ref>,
    purposes: Purpose[],
    onError: ErrorsFn,
): ChannelsState<Purpose, ReadChannel, WriteChannel, Ref> {
    return {
        tc,
        purposes,
        state: {},
        onError,
        asyncWrites: new Set(),
    }
}

/**
 * Return the open write channels for a module, opening them if needed.
 *
 * The first ever open for a module is fresh. Later opens append, because the
 * module already has durable state and a flush marker.
 */
export async function getOrCreateChannels<Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
    moduleScope: ModuleObservabilityScope,
): Promise<ErrorsOr<WriteChannel[]>> {
    const {tc, purposes} = channelState
    const key = tc.keyFrom(moduleScope)

    const existingState = channelState.state[key]
    const append = existingState !== undefined

    const moduleState: ChannelState<WriteChannel, Ref> = existingState ?? {
        refs: purposes.map(tc.reference(moduleScope)),
        lastSize: 0,
        channels: undefined,
    }

    channelState.state[key] = moduleState

    if (moduleState.channels)
        return value(moduleState.channels)

    return mapErrorsOr(
        await mapArrayK(moduleState.refs, ref => tc.create(ref, {append})),
        channels => {
            moduleState.channels = channels
            return channels
        },
    )
}

export type AsyncWrite = (msg: string) => Promise<void>

/**
 * Async durable write for one module.
 *
 * Opens module channels if needed, writes the text to every mirrored channel,
 * and routes failures to the configured error sink.
 */
export const asyncWriteTo = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    (moduleScope: ModuleObservabilityScope): AsyncWrite =>
        async (text: string): Promise<void> => {
            try {
                const errorsOr = await flatMapErrorsOrK(
                    await getOrCreateChannels(channelState, moduleScope),
                    channels =>
                        mapArrayK(channels, channel =>
                            channelState.tc.write(channel, text),
                        ),
                )

                if (isErrors(errorsOr))
                    channelState.onError(errorsOr)
            } catch (e: unknown) {
                channelState.onError(makeErrorFromException(`asyncWriteTo(${moduleScope.module})`, e))
            }
        }

/**
 * Synchronous Write adapter over the async durable write path.
 *
 * log/debug callers can ignore the returned value. Tests and lifecycle code
 * can still await or drain the tracked Promise through waitForAsyncWrites.
 */
export const syncWriteTo = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    (moduleScope: ModuleObservabilityScope): Write =>
        (text: string) =>
            trackAsyncWrite(
                channelState,
                asyncWriteTo(channelState)(moduleScope)(text),
            )

/**
 * Project durable module output to a sink.
 *
 * Flush does not own channel lifecycle. It does not close writable channels.
 * Module lifecycle code is responsible for closing channels before flush is
 * called. Flush only:
 *
 * - waits for already-started async writes to settle
 * - reads durable content from the module's representative ref at lastSize
 * - writes that delta to the supplied sink
 * - updates lastSize to the returned marker
 *
 * Calling flush repeatedly is safe: if no durable content has been added since
 * lastSize, the runtime sendFromRefToWrite implementation should return the
 * same marker and write nothing.
 */
export const flush = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    (moduleScope: ModuleObservabilityScope) =>
        async (write: Write): Promise<ErrorsOr<unknown>> => {
            const {tc, state, purposes} = channelState
            if (purposes.length === 0) return value([])

            await waitForAsyncWrites(channelState)

            const key = tc.keyFrom(moduleScope)
            const moduleState = state[key]

            if (moduleState === undefined) return value([])

            return mapErrorsOr(
                await tc.sendFromRefToWrite(moduleState.refs[0], moduleState.lastSize, write),
                newMarker => {
                    moduleState.lastSize = newMarker
                },
            )
        }