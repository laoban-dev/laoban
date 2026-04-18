export type CorrelationId = string

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export type Logger = (level: LogLevel, ...msg: unknown[]) => void

export type Debug<Context extends string> = (
    context: Context,
    level: LogLevel,
    ...msg: unknown[]
) => void

export type CountMetric = (name: string) => void

export type DurationMetric = (name: string, durationMs: number) => void

export type DebugLevels<Context extends string> = Partial<Record<Context, LogLevel[]>>

export type Observability<Context extends string> = Readonly<{
    correlationId: CorrelationId
    logger: Logger
    debug: Debug<Context>
    countMetric: CountMetric
    durationMetric: DurationMetric
    debugLevels: DebugLevels<Context>
}>

export const shouldDebug = <Context extends string>(
    debugLevels: DebugLevels<Context>,
    context: Context,
    level: LogLevel
): boolean => (debugLevels[context] ?? []).includes(level)

export const nullLogger: Logger = () => {}
export const nullCountMetric: CountMetric = () => {}
export const nullDurationMetric: DurationMetric = () => {}

export const nullObservability = <Context extends string>(
    correlationId: CorrelationId = 'none'
): Observability<Context> => ({
    correlationId,
    logger: nullLogger,
    debug: () => {},
    countMetric: nullCountMetric,
    durationMetric: nullDurationMetric,
    debugLevels: {},
})