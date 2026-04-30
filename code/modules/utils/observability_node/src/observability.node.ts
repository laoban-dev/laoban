import {errors, ErrorsOr, isErrors, value} from "@laoban/errors"
import {
    ChannelObservability,
    channelObservability,
    channelObservabilityWithModule,
    ChannelsState,
    ChannelTc,
    CountMetric,
    CreateOptions,
    DebugConfig,
    defaultModuleObservabilityScope,
    defaultObservabilityContext,
    DurationMetric,
    emptyChannelState,
    ErrorsFn,
    LogLevel,
    Marker,
    ModuleKey,
    ModuleObservabilityScope,
    Observability,
    ObservabilityContext,
    ObservabilityTemplates,
    Write,
} from "@laoban/observability"
import {createReadStream, createWriteStream, promises as fs} from "node:fs"
import * as path from "node:path"
import {Readable, Writable} from "node:stream"
import {safePrettyJson} from "@laoban/safe"

export type NodeReadChannel = Readable
export type NodeWriteChannel = Writable
export type NodeRef = string

export type NodeChannelTcOptions<Purpose> = Readonly<{
    reference: (moduleScope: ModuleObservabilityScope) => (purpose: Purpose) => NodeRef
    keyFrom?: (moduleScope: ModuleObservabilityScope) => ModuleKey
}>

const nodeChannelError = (message: string, e?: unknown): ErrorsOr<never> =>
    errors({
        kind: "nodeChannel",
        message,
        context: {error: String(e)},
    } as any)

const isPromiseLike = (value: unknown): value is Promise<void> =>
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as {then?: unknown}).then === "function"

const awaitWriteResult = async (result: void | Promise<void>): Promise<void> => {
    if (isPromiseLike(result)) await result
}

const openWriteChannel = async (
    ref: NodeRef,
    append: boolean,
): Promise<NodeWriteChannel> => {
    const channel = createWriteStream(ref, {
        flags: append ? "a" : "w",
        encoding: "utf8",
    })

    await new Promise<void>((resolve, reject) => {
        channel.once("open", () => resolve())
        channel.once("error", reject)
    })

    return channel
}

const createWriteChannel = async (
    ref: NodeRef,
    append: boolean,
): Promise<NodeWriteChannel> => {
    try {
        return await openWriteChannel(ref, append)
    } catch {
        await fs.mkdir(path.dirname(ref), {recursive: true})
        return await openWriteChannel(ref, append)
    }
}

export const nodeChannelTc = <Purpose>(
    options: NodeChannelTcOptions<Purpose>,
): ChannelTc<Purpose, NodeReadChannel, NodeWriteChannel, NodeRef> => ({
    reference: options.reference,

    keyFrom: options.keyFrom ?? (moduleScope =>
            String(moduleScope.module ?? "<none>")
    ),

    create: async (ref: NodeRef, {append}: CreateOptions): Promise<ErrorsOr<NodeWriteChannel>> => {
        try {
            return value(await createWriteChannel(ref, append))
        } catch (e) {
            return nodeChannelError(`Failed to create write channel for ${ref}`, e)
        }
    },

    write: async (channel: NodeWriteChannel, text: string): Promise<ErrorsOr<void>> => {
        try {
            await new Promise<void>((resolve, reject) => {
                channel.write(text, "utf8", err => err ? reject(err) : resolve())
            })
            return value(undefined)
        } catch (e) {
            return nodeChannelError("Failed to write to channel", e)
        }
    },

    closeReadable: async (channel: NodeReadChannel): Promise<ErrorsOr<void>> => {
        try {
            channel.destroy()
            return value(undefined)
        } catch (e) {
            return nodeChannelError("Failed to close readable channel", e)
        }
    },

    closeWritable: async (channel: NodeWriteChannel): Promise<ErrorsOr<void>> => {
        try {
            await new Promise<void>((resolve, reject) => {
                channel.once("error", reject)
                channel.end(() => resolve())
            })
            return value(undefined)
        } catch (e) {
            return nodeChannelError("Failed to close writable channel", e)
        }
    },

    sendFromRefToWrite: async (
        ref: NodeRef,
        from: Marker,
        write: Write,
    ): Promise<ErrorsOr<Marker>> => {
        try {
            const stat = await fs.stat(ref)
            const end = stat.size

            if (end <= from) return value(end)

            const read = createReadStream(ref, {
                start: from,
                end: end - 1,
                encoding: "utf8",
            })

            for await (const chunk of read) {
                await awaitWriteResult(write(String(chunk)))
            }

            return value(end)
        } catch (e: any) {
            if (e?.code === "ENOENT") {
                return nodeChannelError(
                    `Failed to send durable content from ${ref}`,
                    "ref does not exist",
                )
            }

            return nodeChannelError(`Failed to send durable content from ${ref}`, e)
        }
    },
})

export type CreateNodeObservabilityConfig<Purpose> = Readonly<{
    correlationId?: string
    moduleScope?: ModuleObservabilityScope
    debugConfig?: DebugConfig
    timeService?: ObservabilityContext["timeService"]
    templates?: Partial<ObservabilityTemplates>
    dictionary?: Record<string, unknown>

    /**
     * Root writable channel for this observability.
     *
     * Usually process.stdout, but injected so tests and other runtimes can
     * provide their own writable stream.
     */
    channel: NodeWriteChannel

    /**
     * The durable purposes used for module-aware observability.
     *
     * The Node layer does not decide what purposes exist. Typical callers may
     * choose values like ".log" and ".session".
     */
    purposes: Purpose[]

    /**
     * Runtime-specific durable reference mapping.
     *
     * This decides where module/purpose output is written. Node only owns
     * the stream/file mechanics; the caller owns the logical purposes.
     */
    reference: (moduleScope: ModuleObservabilityScope) => (purpose: Purpose) => NodeRef

    keyFrom?: (moduleScope: ModuleObservabilityScope) => ModuleKey
    onError: ErrorsFn
    countMetric?: CountMetric
    durationMetric?: DurationMetric
}>

export type CreatedNodeObservability<Purpose> = Readonly<{
    observability: Observability
    channelsState: ChannelsState<Purpose, NodeReadChannel, NodeWriteChannel, NodeRef>
    tc: ChannelTc<Purpose, NodeReadChannel, NodeWriteChannel, NodeRef>
    withModule: (moduleScope: ModuleObservabilityScope) => ChannelObservability
}>

export const createNodeObservability = <Purpose>({
                                                     correlationId = "NoCorrelationId",
                                                     moduleScope = defaultModuleObservabilityScope(),
                                                     debugConfig = {},
                                                     timeService,
                                                     templates,
                                                     dictionary = {},
                                                     channel,
                                                     purposes,
                                                     reference,
                                                     keyFrom,
                                                     onError,
                                                     countMetric,
                                                     durationMetric,
                                                 }: CreateNodeObservabilityConfig<Purpose>): CreatedNodeObservability<Purpose> => {
    const defaultContext = defaultObservabilityContext(
        correlationId,
        debugConfig,
        moduleScope,
    )

    const context: ObservabilityContext = {
        ...defaultContext,
        timeService: timeService ?? defaultContext.timeService,
        templates: {
            ...defaultContext.templates,
            ...(templates ?? {}),
        },
        dictionary,
    }

    const tc = nodeChannelTc<Purpose>({
        reference,
        keyFrom,
    })

    const channelsState = emptyChannelState(tc, purposes, onError)

    return {
        observability: channelObservability(
            context,
            tc,
            channel,
            onError,
            countMetric,
            durationMetric,
        ),
        channelsState,
        tc,
        withModule: moduleScope =>
            channelObservabilityWithModule(
                {
                    ...context,
                    moduleScope,
                },
                moduleScope,
                channelsState,
                countMetric,
                durationMetric,
            ),
    }
}

export function dumpAndExitIfErrors<T>(
    o: Observability,
    e: ErrorsOr<T>,
    level: LogLevel = "error",
): T {
    function dumpOne<T>(title: string, array?: T[]) {
        if (array && array.length) {
            o.log(level, title)
            array.forEach((item, index) => {
                o.log(level, `  ${index + 1}.`, safePrettyJson(item))
            })
        }
    }

    if (isErrors(e)) {
        if (e.reference)
            o.log(level, "Reference:", e.reference)

        dumpOne("Errors:", e.errors)
        dumpOne("Warnings:", e.warnings)
        process.exit(1)
    }

    if (e.warnings)
        dumpOne("Warnings:", e.warnings)

    return e.value
}