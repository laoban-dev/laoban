import {
    averageDurationMs,
    countMetricFor,
    durationMetricFor,
    prettyPrintCountMetrics,
    prettyPrintDurationMetrics,
    prettyPrintMetrics,
    type CountMetrics,
    type DurationMetrics,
} from './metrics.memory';

describe('countMetricFor', () => {
    it('increments a missing metric from zero', () => {
        const counts: CountMetrics = {};
        const countMetric = countMetricFor(counts);

        countMetric('templates.rendered');

        expect(counts).toEqual({
            'templates.rendered': 1,
        });
    });

    it('increments an existing metric', () => {
        const counts: CountMetrics = {
            'templates.rendered': 2,
        };
        const countMetric = countMetricFor(counts);

        countMetric('templates.rendered');

        expect(counts).toEqual({
            'templates.rendered': 3,
        });
    });

    it('tracks multiple named counters independently', () => {
        const counts: CountMetrics = {};
        const countMetric = countMetricFor(counts);

        countMetric('templates.rendered');
        countMetric('templates.rendered');
        countMetric('files.generated');

        expect(counts).toEqual({
            'templates.rendered': 2,
            'files.generated': 1,
        });
    });
});

describe('durationMetricFor', () => {
    it('creates a new duration aggregation when missing', () => {
        const durations: DurationMetrics = {};
        const durationMetric = durationMetricFor(durations);

        durationMetric('compile', 25);

        expect(durations).toEqual({
            compile: {
                count: 1,
                totalMs: 25,
            },
        });
    });

    it('adds to an existing duration aggregation', () => {
        const durations: DurationMetrics = {
            compile: {
                count: 1,
                totalMs: 25,
            },
        };
        const durationMetric = durationMetricFor(durations);

        durationMetric('compile', 15);

        expect(durations).toEqual({
            compile: {
                count: 2,
                totalMs: 40,
            },
        });
    });

    it('tracks multiple named durations independently', () => {
        const durations: DurationMetrics = {};
        const durationMetric = durationMetricFor(durations);

        durationMetric('compile', 25);
        durationMetric('compile', 15);
        durationMetric('publish', 100);

        expect(durations).toEqual({
            compile: {
                count: 2,
                totalMs: 40,
            },
            publish: {
                count: 1,
                totalMs: 100,
            },
        });
    });

    it('allows zero durations', () => {
        const durations: DurationMetrics = {};
        const durationMetric = durationMetricFor(durations);

        durationMetric('compile', 0);

        expect(durations).toEqual({
            compile: {
                count: 1,
                totalMs: 0,
            },
        });
    });

    it('adds negative durations if asked to', () => {
        const durations: DurationMetrics = {};
        const durationMetric = durationMetricFor(durations);

        durationMetric('compile', -5);

        expect(durations).toEqual({
            compile: {
                count: 1,
                totalMs: -5,
            },
        });
    });
});

describe('averageDurationMs', () => {
    it('returns undefined when the metric does not exist', () => {
        const durations: DurationMetrics = {};

        expect(averageDurationMs(durations, 'compile')).toBeUndefined();
    });

    it('returns undefined when the count is zero', () => {
        const durations: DurationMetrics = {
            compile: {
                count: 0,
                totalMs: 100,
            },
        };

        expect(averageDurationMs(durations, 'compile')).toBeUndefined();
    });

    it('returns the average duration in milliseconds', () => {
        const durations: DurationMetrics = {
            compile: {
                count: 4,
                totalMs: 100,
            },
        };

        expect(averageDurationMs(durations, 'compile')).toBe(25);
    });

    it('returns a fractional average when needed', () => {
        const durations: DurationMetrics = {
            compile: {
                count: 2,
                totalMs: 5,
            },
        };

        expect(averageDurationMs(durations, 'compile')).toBe(2.5);
    });
});

describe('prettyPrintCountMetrics', () => {
    it('returns an empty string for no count metrics', () => {
        expect(prettyPrintCountMetrics({})).toBe('');
    });

    it('prints one count metric', () => {
        const counts: CountMetrics = {
            compile: 3,
        };

        expect(prettyPrintCountMetrics(counts)).toBe('compile: 3');
    });

    it('prints count metrics sorted by name', () => {
        const counts: CountMetrics = {
            zebra: 1,
            alpha: 2,
            middle: 3,
        };

        expect(prettyPrintCountMetrics(counts)).toBe(
            ['alpha: 2', 'middle: 3', 'zebra: 1'].join('\n')
        );
    });
});

describe('prettyPrintDurationMetrics', () => {
    it('returns an empty string for no duration metrics', () => {
        expect(prettyPrintDurationMetrics({})).toBe('');
    });

    it('prints one duration metric with count, total, and average', () => {
        const durations: DurationMetrics = {
            compile: {
                count: 2,
                totalMs: 10,
            },
        };

        expect(prettyPrintDurationMetrics(durations)).toBe(
            'compile: count=2, totalMs=10, averageMs=5'
        );
    });

    it('prints duration metrics sorted by name', () => {
        const durations: DurationMetrics = {
            zebra: {
                count: 1,
                totalMs: 10,
            },
            alpha: {
                count: 2,
                totalMs: 6,
            },
        };

        expect(prettyPrintDurationMetrics(durations)).toBe(
            [
                'alpha: count=2, totalMs=6, averageMs=3',
                'zebra: count=1, totalMs=10, averageMs=10',
            ].join('\n')
        );
    });

    it('prints averageMs as 0 when count is zero', () => {
        const durations: DurationMetrics = {
            compile: {
                count: 0,
                totalMs: 100,
            },
        };

        expect(prettyPrintDurationMetrics(durations)).toBe(
            'compile: count=0, totalMs=100, averageMs=0'
        );
    });
});

describe('prettyPrintMetrics', () => {
    it('returns an empty string when both counts and durations are empty', () => {
        expect(prettyPrintMetrics({}, {})).toBe('');
    });

    it('prints only counts when durations are empty', () => {
        const counts: CountMetrics = {
            compile: 2,
        };

        expect(prettyPrintMetrics(counts, {})).toBe(
            ['Counts', 'compile: 2'].join('\n')
        );
    });

    it('prints only durations when counts are empty', () => {
        const durations: DurationMetrics = {
            compile: {
                count: 2,
                totalMs: 10,
            },
        };

        expect(prettyPrintMetrics({}, durations)).toBe(
            ['Durations', 'compile: count=2, totalMs=10, averageMs=5'].join('\n')
        );
    });

    it('prints counts and durations with a blank line between sections', () => {
        const counts: CountMetrics = {
            files: 1,
        };
        const durations: DurationMetrics = {
            compile: {
                count: 2,
                totalMs: 10,
            },
        };

        expect(prettyPrintMetrics(counts, durations)).toBe(
            [
                'Counts',
                'files: 1',
                '',
                'Durations',
                'compile: count=2, totalMs=10, averageMs=5',
            ].join('\n')
        );
    });
});