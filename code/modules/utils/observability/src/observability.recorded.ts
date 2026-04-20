import {CorrelationId, DebugLevels, LogLevel, Observability, realTimeService,} from "./observability";

export type RecordedLog = Readonly<{
    level: LogLevel;
    msg: unknown[];
}>;

export type RecordedDebug = Readonly<{
    context: string,
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
    timeService = realTimeService
): RecordingObservability => {
    const logs: RecordedLog[] = [];
    const debug: RecordedDebug[] = [];
    const counts: string[] = [];
    const durations: RecordedDuration[] = [];

    return {
        observability: {
            correlationId,
            logger: (level, ...msg) => logs.push({level, msg}),
            debug: (context, level, ...msg) => debug.push({context, level, msg}),
            countMetric: name => counts.push(name),
            durationMetric: (name, durationMs) => durations.push({name, durationMs}),
            debugLevels,
            timeService
        },
        logs,
        debug,
        counts,
        durations,

    };
};