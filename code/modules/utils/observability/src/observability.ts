import {Errors} from "@laoban/errors/src/error.monad";
import {safePrettyJson} from "@laoban/safe";

export type CorrelationId = string

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export type Logger = (level: LogLevel, ...msg: unknown[]) => void

export type Debug = (
    context: string,
    level: LogLevel,
    ...msg: unknown[]
) => void

export type CountMetric = (name: string) => void

export type DurationMetric = (name: string, durationMs: number) => void

export type TimeService = {
    now: () => number
}

export type DebugLevels = Record<string, LogLevel[]>

export type Observability = Readonly<{
    correlationId: CorrelationId
    logger: Logger
    debug: Debug
    countMetric: CountMetric
    durationMetric: DurationMetric
    debugLevels: DebugLevels
    timeService: TimeService
}>

export const shouldDebug = (
    debugLevels: DebugLevels,
    context: string,
    level: LogLevel
): boolean => (debugLevels[context] ?? []).includes(level)

export const nullLogger: Logger = () => {
}
export const nullCountMetric: CountMetric = () => {
}
export const nullDurationMetric: DurationMetric = () => {
}
export const realTimeService: TimeService = {now: () => Date.now()}
export const fixedTimeService = (now: number): TimeService => ({
    now: () => now,
})

export const steppingTimeService = (
    start: number = 0,
    stepMs: number = 1
): TimeService => {
    let current = start
    return {
        now: () => {
            const result = current
            current += stepMs
            return result
        },
    }
}

export const nullObservability = (
    correlationId: CorrelationId = 'none'
): Observability => ({
    correlationId,
    logger: nullLogger,
    debug: () => {
    },
    countMetric: nullCountMetric,
    durationMetric: nullDurationMetric,
    debugLevels: {},
    timeService: realTimeService,
})

export function dumpErrors<Context extends string>(o: Observability, e: Errors, level: LogLevel = 'error'): void {
    function dumpOne<T>(title: string, array?: T[]) {
        if (array && array.length) {
            o.logger(level, title)
            array.forEach((item, index) => {
                o.logger(level, `  ${index + 1}.`, safePrettyJson(item))
            })
        }
    }

    if (e.reference)
        o.logger(level, "Reference:", e.reference)
    dumpOne("Errors:", e.errors)
    dumpOne("Warnings:", e.warnings)
}