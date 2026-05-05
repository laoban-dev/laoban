import {isValue} from "@laoban/errors"
import {safeString} from "@laoban/safe"
import {defaultTemplateEngine} from "@laoban/template"
import {
    CorrelationId,
    ModuleObservabilityScope,
    realTimeService,
    TimeService,
} from "./observability"
import {LogLevel} from "./observability.debug"

export type ObservabilityTemplates = Readonly<{
    log: string
    debug: string
}>

export const defaultObservabilityWithCorrelationIdTemplates: ObservabilityTemplates = {
    log: "${time} ${level} [${correlationId}] ${message}",
    debug: "${time} ${level} [${correlationId}] [${context}] ${message}",
}

export const defaultObservabilityTemplates: ObservabilityTemplates = {
    log: "${time} ${level} ${message}",
    debug: "${time} ${level} [${context}] ${message}",
}

export type LogDictionaryContext = Readonly<{
    timeService?: TimeService
    templates?: Partial<ObservabilityTemplates>
    dictionary?: Record<string, unknown>
}>

export type EffectiveLogDictionaryContext = Required<LogDictionaryContext>

export type MakeLogDictionaryOptions = LogDictionaryContext & Readonly<{
    context?: string
    correlationId: CorrelationId
    moduleScope: ModuleObservabilityScope
}>

export type MakeRenderedLogOptions = MakeLogDictionaryOptions & Readonly<{
    level: LogLevel
    msg: unknown[]
    template: keyof ObservabilityTemplates
}>

export const formatLogTime = (date: Date): string =>
    date.toISOString().slice(11, 19)

export const effectiveLogDictionaryContext = (
    context: LogDictionaryContext = {},
): EffectiveLogDictionaryContext => ({
    timeService: context.timeService ?? realTimeService,
    templates: {
        ...defaultObservabilityTemplates,
        ...(context.templates ?? {}),
    },
    dictionary: context.dictionary ?? {},
})

export const renderTemplateSafely = (
    template: string,
    dictionary: Record<string, unknown>,
): string => {
    const result = defaultTemplateEngine(template, dictionary)
    return isValue(result) ? result.value : template
}

export const renderOneMessage = (
    message: unknown,
    dictionary: Record<string, unknown>,
): string => {
    if (typeof message !== "string") return safeString(message)
    return renderTemplateSafely(message, dictionary)
}

export const renderMessages = (
    messages: unknown[],
    dictionary: Record<string, unknown>,
): string =>
    messages.map(msg => renderOneMessage(msg, dictionary)).join(" ")

export const makeLogDictionary = ({
                                      correlationId,
                                      moduleScope,
                                      timeService,
                                      templates,
                                      dictionary,
                                      context,
                                  }: MakeLogDictionaryOptions): Record<string, unknown> => {
    const effective = effectiveLogDictionaryContext({
        timeService,
        templates,
        dictionary,
    })

    const timestamp = effective.timeService.now()

    return {
        ...effective.dictionary,
        correlationId,
        module: moduleScope.module,
        directory: moduleScope.directory,
        timestamp,
        time: formatLogTime(new Date(timestamp)),
        context,
    }
}

export const renderObservabilityLine = ({
                                            template,
                                            level,
                                            msg,
                                            ...options
                                        }: MakeRenderedLogOptions): string => {
    const effective = effectiveLogDictionaryContext(options)
    const baseDictionary = makeLogDictionary(options)
    const message = renderMessages(msg, baseDictionary)

    return renderTemplateSafely(effective.templates[template] || "", {
        ...baseDictionary,
        level: level?.toUpperCase(),
        message,
    })
}