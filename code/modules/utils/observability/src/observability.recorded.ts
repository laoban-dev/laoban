import {
    CorrelationId,
    ModuleName,
    Observability,
    realTimeService,
    TimeService,
    defaultObservabilityContext,
    makeObservability,
} from "./observability"
import {
    DebugConfig,
    DebugName,
    emptyDebugConfig,
    LogLevel,
    renderDebugName,
} from "./observability.debug"

export type RecordedLog = Readonly<{
    module: ModuleName
    msg: string
}>

export type RecordedDebug = Readonly<{
    module: ModuleName
    debugName: DebugName
    context: string
    level: LogLevel
    msg: unknown[]
}>

export type RecordedDuration = Readonly<{
    name: string
    durationMs: number
}>

export type RecordingObservability = Readonly<{
    observability: Observability
    logs: RecordedLog[]
    debug: RecordedDebug[]
    counts: string[]
    durations: RecordedDuration[]
}>

export const recordingObservability = (
    debugConfig: DebugConfig = emptyDebugConfig,
    correlationId: CorrelationId = "test-correlation-id",
    timeService: TimeService = realTimeService,
    module: ModuleName = undefined,
): RecordingObservability => {
    const logs: RecordedLog[] = []
    const debug: RecordedDebug[] = []
    const counts: string[] = []
    const durations: RecordedDuration[] = []

    const context = {
        ...defaultObservabilityContext(correlationId, debugConfig, module),
        timeService,
    }

    const base = makeObservability({
        context,
        target: {
            write: msg => {
                logs.push({module, msg})
            },
        },
        countMetric: name => counts.push(name),
        durationMetric: (name, durationMs) =>
            durations.push({name, durationMs}),
    })

    const observability: Observability = {
        ...base,
        debug: (debugName, level, ...msg) => {
            debug.push({
                module,
                debugName,
                context: renderDebugName(debugName),
                level,
                msg,
            })

            return base.debug(debugName, level, ...msg)
        },
    }

    return {
        observability,
        logs,
        debug,
        counts,
        durations,
    }
}