import { type CountMetric, type DurationMetric } from './observability';

export type CountMetrics = Record<string, number>;

export type DurationMetricAggregation = {
    count: number;
    totalMs: number;
};

export type DurationMetrics = Record<string, DurationMetricAggregation>;

export const countMetricFor = (counts: CountMetrics): CountMetric =>
    (name: string) => {
        counts[name] = (counts[name] ?? 0) + 1;
    };

export const durationMetricFor = (durations: DurationMetrics): DurationMetric =>
    (name: string, durationMs: number) => {
        const current = durations[name] ?? { count: 0, totalMs: 0 };
        durations[name] = {
            count: current.count + 1,
            totalMs: current.totalMs + durationMs,
        };
    };

export const averageDurationMs = (
    durations: DurationMetrics,
    name: string
): number | undefined => {
    const value = durations[name];
    if (!value || value.count === 0) return undefined;
    return value.totalMs / value.count;
};

export const prettyPrintCountMetrics = (counts: CountMetrics): string =>
    Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => `${name}: ${count}`)
        .join('\n');

export const prettyPrintDurationMetrics = (durations: DurationMetrics): string =>
    Object.entries(durations)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => {
            const averageMs = value.count === 0 ? 0 : value.totalMs / value.count;
            return `${name}: count=${value.count}, totalMs=${value.totalMs}, averageMs=${averageMs}`;
        })
        .join('\n');

export const prettyPrintMetrics = (
    counts: CountMetrics,
    durations: DurationMetrics
): string => {
    const countText = prettyPrintCountMetrics(counts);
    const durationText = prettyPrintDurationMetrics(durations);

    if (countText && durationText) {
        return `Counts\n${countText}\n\nDurations\n${durationText}`;
    }
    if (countText) {
        return `Counts\n${countText}`;
    }
    if (durationText) {
        return `Durations\n${durationText}`;
    }
    return '';
};