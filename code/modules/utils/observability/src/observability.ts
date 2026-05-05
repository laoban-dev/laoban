import {Errors} from "@laoban/errors"
import {safePrettyJson} from "@laoban/safe"
import {
    DebugConfig,
    DebugName,
    emptyDebugConfig,
    LogLevel,
    renderDebugName,
    shouldDebug,
} from "./observability.debug"
import {
    defaultObservabilityTemplates,
    ObservabilityTemplates,
    renderObservabilityLine,
} from "./observability.log"
import {Write} from "./write.with.flush"

export type CorrelationId = string
export type ModuleName = string | null | undefined

export type ModuleObservabilityScope = Readonly<{
    module: ModuleName
    directory: string
}>

export type Log = (...msg: unknown[]) => void

export type Debug = (
    debugName: DebugName,
    level: LogLevel,
    ...msg: unknown[]
) => void

export type CountMetric = (name: string) => void

export type DurationMetric = (name: string, durationMs: number) => void

export type TimeService = {
    now: () => number
}

export type ObservabilityContext = Readonly<{
    correlationId: CorrelationId
    moduleScope: ModuleObservabilityScope
    debugConfig: DebugConfig
    timeService: TimeService
    observabilityTemplates: Partial<ObservabilityTemplates>
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

export const nullLog: Log = () => {
}

export const nullCountMetric: CountMetric = () => {
}

export const nullDurationMetric: DurationMetric = () => {
}

export const realTimeService: TimeService = {
    now: () => Date.now(),
}

export const fixedTimeService = (now: number): TimeService => ({
    now: () => now,
})

export const steppingTimeService = (
    start: number = 0,
    stepMs: number = 1,
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

export const defaultModuleObservabilityScope = (
    module: ModuleName = undefined,
    directory: string = ".",
): ModuleObservabilityScope => ({
    module,
    directory,
})

export const defaultObservabilityContext = (
    correlationId: CorrelationId = "none",
    debugConfig: DebugConfig = emptyDebugConfig,
    moduleScope: ModuleObservabilityScope = defaultModuleObservabilityScope(),
): ObservabilityContext => ({
    correlationId,
    moduleScope,
    debugConfig,
    timeService: realTimeService,
    observabilityTemplates: defaultObservabilityTemplates,
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

    debug: (debugName, level, ...msg) => {
        if (!shouldDebug(context.debugConfig, debugName, level)) return

        return target.write(`${renderObservabilityLine({
            ...context,
            template: "debug",
            context: renderDebugName(debugName),
            level,
            msg,
        })}\n`)
    },
})

export const nullObservability = (
    correlationId: CorrelationId = "none",
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