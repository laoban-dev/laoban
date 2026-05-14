import {
    Errors,
    ErrorsOr,
    isErrors,
    makeErrorFromException,
    mapErrorsOr,
    sequenceArrayErrorsOrK,
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
 * A simple text sink used by Observability.
 *
 * This is not the durable channel abstraction. It is the small synchronous-looking
 * function shape consumed by makeObservability.
 *
 * Runtime-specific durable channels remain represented by WriteChannel and are
 * manipulated through ChannelTc.
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

export type ComposeWritables<WriteChannel> = (
    channels: WriteChannel[],
    onError?: ErrorsFn,
) => WriteChannel

/**
 * Runtime-specific durable channel operations.
 *
 * The core observability code knows only that it can open, write, compose,
 * close, and project durable content from a stable marker into another
 * writable channel.
 *
 * Node files/streams are one implementation; tests and other runtimes can
 * provide others.
 */
export type ChannelTc<Purpose, ReadChannel, WriteChannel, Ref> = {
    reference: (moduleScope: ModuleObservabilityScope) => (purpose: Purpose) => Ref
    keyFrom: (moduleScope: ModuleObservabilityScope) => ModuleKey

    create: (ref: Ref, options: CreateOptions) => Promise<ErrorsOr<WriteChannel>>
    write: (channel: WriteChannel, text: string) => Promise<ErrorsOr<void>>

    /**
     * Compose several writable channels into one writable channel.
     *
     * For Node this returns a real Writable fan-out stream. The composed
     * writable is lifecycle-neutral: closing the durable child channels remains
     * the responsibility of closeWritable on the original channels.
     */
    composeWritables: ComposeWritables<WriteChannel>

    closeReadable: (channel: ReadChannel) => Promise<ErrorsOr<void>>
    closeWritable: (channel: WriteChannel) => Promise<ErrorsOr<void>>

    /**
     * Project durable content from marker `from` to the current durable end
     * into a runtime writable channel.
     *
     * Returns the new marker. For file-backed implementations this is typically
     * the file size in bytes observed during the projection.
     *
     * In the Node implementation this can be implemented by piping a readable
     * stream for the durable ref range into the supplied writable channel.
     */
    sendFromRefToWrite: (
        ref: Ref,
        from: Marker,
        write: WriteChannel,
    ) => Promise<ErrorsOr<Marker>>
}

export type SameChannelTc<Purpose, Channel, Ref> =
    ChannelTc<Purpose, Channel, Channel, Ref>

/**
 * State for one module's mirrored durable output.
 *
 * `moduleScope` is stored with the state because the state is keyed by
 * `ModuleKey`, but flushing needs the original `ModuleObservabilityScope` in
 * order to project durable content through the runtime `ChannelTc`.
 *
 * `refs` are the durable targets for this module, for example ".log" and
 * ".session". Writes are mirrored to all refs.
 *
 * `channels` are the currently open writable handles for those refs. Module
 * observability lifecycle code is responsible for closing these handles and
 * clearing `channels`. A state remains flushable after `channels` is cleared.
 *
 * `touched` means this module has started durable output since the last
 * successful flush. `flushAllTouchedChannels` uses this flag to avoid projection
 * work for modules that have not changed in the current generation/lifecycle
 * window.
 *
 * `lastSize` is the projection marker for `refs[0]`, the representative durable
 * source used during flush. Mirrored refs receive the same writes, but only one
 * ref is projected to stdout to avoid duplicate output.
 */
export type ChannelState<WriteChannel, Ref> = {
    lastSize: Marker
    refs: Ref[]
    moduleScope: ModuleObservabilityScope
    touched: boolean
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
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
    moduleScope: ModuleObservabilityScope,
): Promise<ErrorsOr<WriteChannel[]>> {
    const {tc, purposes} = channelsState
    const key = tc.keyFrom(moduleScope)

    const existingState = channelsState.state[key]
    const append = existingState !== undefined

    const moduleState: ChannelState<WriteChannel, Ref> = existingState ?? {
        refs: purposes.map(tc.reference(moduleScope)),
        lastSize: 0,
        moduleScope,
        touched: false,
        channels: undefined,
    }

    channelsState.state[key] = moduleState

    if (moduleState.channels)
        return value(moduleState.channels)

    return mapErrorsOr(
        await sequenceArrayErrorsOrK(
            moduleState.refs.map(ref => tc.create(ref, {append})),
        ),
        channels => {
            moduleState.channels = channels
            return channels
        },
    )
}

/**
 * Mark a module as having started durable output since the previous successful
 * flush.
 *
 * We mark at write-start, not write-success. If the durable write partially
 * succeeds then fails, attempting to flush the representative durable ref is
 * safer than accidentally hiding partial durable output.
 */
export const markTouched = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
    moduleScope: ModuleObservabilityScope,
): void => {
    const key = channelsState.tc.keyFrom(moduleScope)
    const moduleState = channelsState.state[key]

    if (moduleState) {
        moduleState.touched = true
        return
    }

    channelsState.onError(
        makeErrorFromException(
            `markTouched(${String(moduleScope.module)})`,
            new Error("No channel state exists for module"),
            moduleScope,
        ),
    )
}

/**
 * Async durable write to an already-open writable channel.
 *
 * This does not create channels and does not mirror to child channels. The
 * caller supplies the target channel, which for module observability will
 * normally be the composed fan-out channel.
 */
export const asyncWriteToChannel = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    (channel: WriteChannel) =>
        async (text: string): Promise<void> => {
            try {
                const writeResult = await channelsState.tc.write(channel, text)

                if (isErrors(writeResult))
                    channelsState.onError(writeResult)
            } catch (e: unknown) {
                channelsState.onError(
                    makeErrorFromException("asyncWriteToChannel", e),
                )
            }
        }

/**
 * Synchronous Write adapter over an async durable channel write.
 *
 * log/debug callers can ignore the returned value. Lifecycle code can still
 * await or drain the tracked Promise through waitForAsyncWrites.
 *
 * This is the key bridge:
 *
 * - Observability.log/debug remain sync at the call site
 * - durable channel writes can be async
 * - lifecycle boundaries can wait for all writes started so far
 */
export const syncWriteTo = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    (moduleScope: ModuleObservabilityScope) =>
        (channel: WriteChannel): Write =>
            (text: string) => {
                markTouched(channelsState, moduleScope)

                return trackAsyncWrite(
                    channelsState,
                    asyncWriteToChannel(channelsState)(channel)(text),
                )
            }

/**
 * Project durable module output to a writable channel.
 *
 * Flush does not own channel lifecycle. It does not close writable channels.
 * Module lifecycle code is responsible for closing module channels before flush
 * is called. Flush only:
 *
 * - waits for already-started async writes to settle
 * - reads durable content from the module's representative ref at lastSize
 * - writes/pipes that delta to the supplied writable channel
 * - updates lastSize to the returned marker
 * - clears touched after successful projection
 *
 * Calling flush repeatedly is safe: if no durable content has been added since
 * lastSize, the runtime sendFromRefToWrite implementation should return the
 * same marker and write nothing.
 */
export const flush = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    (moduleScope: ModuleObservabilityScope) =>
        async (write: WriteChannel): Promise<ErrorsOr<unknown>> => {
            const {tc, state, purposes} = channelsState
            if (purposes.length === 0) return value([])

            await waitForAsyncWrites(channelsState)

            const key = tc.keyFrom(moduleScope)
            const moduleState = state[key]

            if (moduleState === undefined) return value([])

            return mapErrorsOr(
                await tc.sendFromRefToWrite(
                    moduleState.refs[0],
                    moduleState.lastSize,
                    write,
                ),
                newMarker => {
                    moduleState.lastSize = newMarker
                    moduleState.touched = false
                },
            )
        }

/**
 * Flush every module that has written durable content since its last successful
 * flush.
 *
 * A module state remains flushable after its writable channels have been closed
 * and `channels` has been cleared. The `touched` flag identifies which known
 * module states actually need projection work; the `lastSize` marker prevents
 * duplicate projected output.
 */
export const flushAllTouchedChannels = <Purpose, ReadChannel, WriteChannel, Ref>(
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>,
) =>
    async (write: WriteChannel): Promise<ErrorsOr<unknown>> =>
        mapErrorsOr(
            await sequenceArrayErrorsOrK(
                Object.values(channelsState.state)
                    .filter(state => state.touched)
                    .map(state =>
                        flush(channelsState)(state.moduleScope)(write),
                    ),
            ),
            () => undefined,
        )