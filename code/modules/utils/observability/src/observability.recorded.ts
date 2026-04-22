import {CorrelationId, DebugLevels, LogLevel, ModuleName, Observability, realTimeService,} from "./observability";

export type RecordedLog = Readonly<{
    module: ModuleName;
    level: LogLevel;
    msg: unknown[];
}>;

export type RecordedDebug = Readonly<{
    module: ModuleName;
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

    const build = (module: ModuleName): Observability => ({
        correlationId,
        module,
        logger: (level, ...msg) => logs.push({module, level, msg}),
        debug: (context, level, ...msg) => debug.push({module, context, level, msg}),
        countMetric: name => counts.push(name),
        durationMetric: (name, durationMs) => durations.push({name, durationMs}),
        debugLevels,
        timeService,
        withModule: build
    });

    return {
        observability: build(undefined),
        logs,
        debug,
        counts,
        durations,
    };
};