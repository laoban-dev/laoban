import {
    CorrelationId,
    CountMetric,
    Debug,
    DebugLevels,
    DurationMetric,
    Logger,
    LogLevel, nullCountMetric, nullDurationMetric, nullLogger,
    Observability, realTimeService,
} from "./observability";

export type RecordedLog = Readonly<{
    level: LogLevel;
    msg: unknown[];
}>;

export type RecordedDebug<Context extends string> = Readonly<{
    context: Context;
    level: LogLevel;
    msg: unknown[];
}>;

export type RecordedDuration = Readonly<{
    name: string;
    durationMs: number;
}>;

export type RecordingObservability<Context extends string> = Readonly<{
    observability: Observability<Context>;
    logs: RecordedLog[];
    debug: RecordedDebug<Context>[];
    counts: string[];
    durations: RecordedDuration[];
}>;


export const recordingObservability = <Context extends string>(
    debugLevels: DebugLevels<Context> = {},
    correlationId: CorrelationId = "test-correlation-id",
    timeService = realTimeService
): RecordingObservability<Context> => {
    const logs: RecordedLog[] = [];
    const debug: RecordedDebug<Context>[] = [];
    const counts: string[] = [];
    const durations: RecordedDuration[] = [];

    return {
        observability: {
            correlationId,
            logger: (level, ...msg) => logs.push({ level, msg }),
            debug: (context, level, ...msg) => debug.push({ context, level, msg }),
            countMetric: name => counts.push(name),
            durationMetric: (name, durationMs) => durations.push({ name, durationMs }),
            debugLevels,
            timeService
        },
        logs,
        debug,
        counts,
        durations,

    };
};