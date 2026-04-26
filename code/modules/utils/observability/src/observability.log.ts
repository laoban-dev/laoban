import {isValue} from "@laoban/errors";
import {safeString} from "@laoban/safe";
import {renderTemplate} from "@laoban/template";
import {
    CorrelationId,
    LogLevel,
    ModuleName,
    nullObservability,
    realTimeService,
    TimeService
} from "./observability";

export type ObservabilityTemplates = Readonly<{
    log: string
    debug: string
}>

export const defaultObservabilityTemplates: ObservabilityTemplates = {
    log: "${timestamp} ${level} [${correlationId}] ${message}",
    debug: "${timestamp} ${level} [${correlationId}] [${context}] ${message}",
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
    module: ModuleName
}>

export type MakeRenderedLogOptions = MakeLogDictionaryOptions & Readonly<{
    level: LogLevel
    msg: unknown[]
    template: keyof ObservabilityTemplates
}>

export const effectiveLogDictionaryContext = (
    context: LogDictionaryContext = {}
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
    dictionary: Record<string, unknown>
): string => {
    const result = renderTemplate(template, dictionary)
    return isValue(result) ? result.value : template
}

export const renderOneMessage = (
    message: unknown,
    dictionary: Record<string, unknown>
): string => {
    if (typeof message !== "string") return safeString(message)
    return renderTemplateSafely(message, dictionary)
}

export const renderMessages = (
    messages: unknown[],
    dictionary: Record<string, unknown>
): string =>
    messages.map(msg => renderOneMessage(msg, dictionary)).join(" ")

export const makeLogDictionary = ({
                                      correlationId,
                                      module,
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

    return {
        ...effective.dictionary,
        correlationId,
        module,
        timestamp: effective.timeService.now(),
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

    return renderTemplateSafely(effective.templates[template]||'', {
        ...baseDictionary,
        level: level?.toUpperCase(),
        message,
    })
}