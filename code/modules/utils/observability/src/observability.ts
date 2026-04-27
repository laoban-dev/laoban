import {Errors} from "@laoban/errors";
import {safePrettyJson} from "@laoban/safe";
import {defaultObservabilityTemplates, ObservabilityTemplates, renderObservabilityLine} from "./observability.log";
import {Write} from "./write.with.flush";

export type CorrelationId = string
export type ModuleName = string | null | undefined

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export type Log = (...msg: unknown[]) => void

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

export type ObservabilityContext = Readonly<{
    correlationId: CorrelationId
    module: ModuleName
    debugLevels: DebugLevels
    timeService: TimeService
    templates: Partial<ObservabilityTemplates>
    dictionary: Record<string, unknown>
}>

export type ObservabilityTarget = Readonly<{
    write: Write
}>

export type Observability = ObservabilityContext & Readonly<{
    log: Log
    debug: Debug
    countMetric: CountMetric
    durationMetric: DurationMetric
}>

export type MakeObservabilityOptions = Readonly<{
    context: ObservabilityContext
    target: ObservabilityTarget
    countMetric?: CountMetric
    durationMetric?: DurationMetric
}>

export const shouldDebug = (
    debugLevels: DebugLevels,
    context: string,
    level: LogLevel
): boolean => (debugLevels[context] ?? []).includes(level)

export const nullLog: Log = () => {
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

export const defaultObservabilityContext = (
    correlationId: CorrelationId = 'none',
    debugLevels: DebugLevels = {},
    module: ModuleName = undefined
): ObservabilityContext => ({
    correlationId,
    module,
    debugLevels,
    timeService: realTimeService,
    templates: defaultObservabilityTemplates,
    dictionary: {},
})

export const makeObservability = ({
                                      context,
                                      target,
                                      countMetric = nullCountMetric,
                                      durationMetric = nullDurationMetric,
                                  }: MakeObservabilityOptions): Observability => ({
    ...context,
    countMetric,
    durationMetric,

    log: (...msg: unknown[]) =>
        target.write(`${renderObservabilityLine({
            ...context,
            template: "log",
            level: "info",
            msg,
        })}\n`),

    debug: (debugContext, level, ...msg) => {
        if (!shouldDebug(context.debugLevels, debugContext, level)) return

        return target.write(`${renderObservabilityLine({
            ...context,
            template: "debug",
            context: debugContext,
            level,
            msg,
        })}\n`)
    },
})

export const nullObservability = (
    correlationId: CorrelationId = 'none'
): Observability =>
    makeObservability({
        context: defaultObservabilityContext(correlationId),
        target: {write: nullLog},
    })

export function dumpErrors(o: Observability, e: Errors): void {
    function dumpOne<T>(title: string, array?: T[]) {
        if (array && array.length) {
            o.log(title)
            array.forEach((item, index) => {
                o.log(`  ${index + 1}.`, safePrettyJson(item))
            })
        }
    }

    if (e.reference)
        o.log("Reference:", e.reference)
    dumpOne("Errors:", e.errors)
    dumpOne("Warnings:", e.warnings)
}