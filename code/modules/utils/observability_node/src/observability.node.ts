import {isValue} from "@laoban/errors";
import {
    type CorrelationId,
    countMetricFor,
    type CountMetrics,
    type DebugLevels,
    durationMetricFor,
    type DurationMetrics,
    nullCountMetric,
    nullDurationMetric,
    nullObservability,
    type Observability, realTimeService,
    shouldDebug,
} from "@laoban/observability";
import {safeString} from "@laoban/safe";
import {renderTemplate} from "@laoban/template";
import {fileLogSink, type NodeLogSink} from "./log.sinks";

export type SinkFactory = (fileName: string) => NodeLogSink;

export type NodeObservabilityTemplates = Readonly<{
    log: string;
    debug: string;
}>;

export type NodeObservabilityConfig<Context extends string> = Readonly<{
    correlationId: CorrelationId;
    debugLevels?: DebugLevels<Context>;
    sinks?: (NodeLogSink | string)[];
    sinkFactory?: SinkFactory;
    dictionary?: Record<string, unknown>;
    now?: () => Date;
    templates?: Partial<NodeObservabilityTemplates>;
    countMetrics?: CountMetrics;
    durationMetrics?: DurationMetrics;
}>;

const defaultNow = () => new Date();

const defaultTemplates: NodeObservabilityTemplates = {
    log: "${timestamp} ${level} [${correlationId}] ${message}",
    debug: "${timestamp} ${level} [${correlationId}] [${context}] ${message}",
};

const renderTemplateSafely = (
    template: string,
    dictionary: Record<string, unknown>
): string => {
    const result = renderTemplate(template, dictionary, {
        observability: nullObservability(),
    });
    return isValue(result) ? result.value : template;
};

const renderOneMessage = (
    message: unknown,
    dictionary: Record<string, unknown>
): string => {
    if (typeof message !== "string") return safeString(message);
    return renderTemplateSafely(message, dictionary);
};

const renderMessages = (
    messages: unknown[],
    dictionary: Record<string, unknown>
): string =>
    messages.map(msg => renderOneMessage(msg, dictionary)).join(" ");

const normaliseSinks = (
    sinks: (NodeLogSink | string)[],
    sinkFactory: SinkFactory
): NodeLogSink[] =>
    sinks.map(sink => typeof sink === "string" ? sinkFactory(sink) : sink);

const writeToSinks = (
    sinks: NodeLogSink[],
    line: string
): void => {
    for (const sink of sinks) sink(line);
};

export function createNodeObservability<Context extends string>(): Observability<Context>;
export function createNodeObservability<Context extends string>(
    config: NodeObservabilityConfig<Context>
): Observability<Context>;
export function createNodeObservability<Context extends string>(
    config?: NodeObservabilityConfig<Context>
): Observability<Context> {
    const {
        correlationId = "NoCorrelationId",
        debugLevels = {},
        sinks = [],
        sinkFactory = fileLogSink,
        dictionary = {},
        now = defaultNow,
        templates = {},
        countMetrics,
        durationMetrics,
    } = config ?? {};

    const effectiveTemplates: NodeObservabilityTemplates = {
        ...defaultTemplates,
        ...templates,
    };

    const effectiveSinks = normaliseSinks(sinks, sinkFactory);

    const baseDictionary: Record<string, unknown> = {
        correlationId,
        ...dictionary,
    };

    return {
        correlationId,
        debugLevels,
        countMetric: countMetrics ? countMetricFor(countMetrics) : nullCountMetric,
        durationMetric: durationMetrics ? durationMetricFor(durationMetrics) : nullDurationMetric,
        timeService: realTimeService,
        logger: (level, ...msg) => {
            const timestamp = now().toISOString();
            const message = renderMessages(msg, baseDictionary);
            const line = renderTemplateSafely(effectiveTemplates.log, {
                ...baseDictionary,
                timestamp,
                level: level.toUpperCase(),
                message,
            });
            writeToSinks(effectiveSinks, line);
        },

        debug: (context, level, ...msg) => {
            if (!shouldDebug(debugLevels, context, level)) return;

            const timestamp = now().toISOString();
            const message = renderMessages(msg, baseDictionary);
            const line = renderTemplateSafely(effectiveTemplates.debug, {
                ...baseDictionary,
                timestamp,
                context,
                level: level.toUpperCase(),
                message,
            });
            writeToSinks(effectiveSinks, line);
        },
    };
}