import {
    CorrelationId,
    DebugLevels,
    LogLevel,
    ModuleName,
    Observability,
    realTimeService,
    TimeService,
    defaultObservabilityContext,
    makeObservability,
} from "./observability";

export type RecordedLog = Readonly<{
    module: ModuleName;
    msg: string;
}>;

export type RecordedDebug = Readonly<{
    module: ModuleName;
    context: string;
    level: LogLevel;
    msg: unknown[];
}>;

export type RecordedDuration = Readonly<{
    name: string;
    durationMs: number;
}>;

export type RecordingObservability = Readonly<{
    observability: Observability;
    logs: RecordedLog[];
    debug: RecordedDebug[];
    counts: string[];
    durations: RecordedDuration[];
}>;

export const recordingObservability = (
    debugLevels: DebugLevels = {},
    correlationId: CorrelationId = "test-correlation-id",
    timeService: TimeService = realTimeService,
    module: ModuleName = undefined,
): RecordingObservability => {
    const logs: RecordedLog[] = [];
    const debug: RecordedDebug[] = [];
    const counts: string[] = [];
    const durations: RecordedDuration[] = [];

    const context = {
        ...defaultObservabilityContext(correlationId, debugLevels, module),
        timeService,
    };

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
    });

    const observability: Observability = {
        ...base,
        debug: (debugContext, level, ...msg) => {
            debug.push({module, context: debugContext, level, msg});
            return base.debug(debugContext, level, ...msg);
        },
    };

    return {
        observability,
        logs,
        debug,
        counts,
        durations,
    };
};