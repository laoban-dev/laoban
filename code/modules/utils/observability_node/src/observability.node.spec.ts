import { createNodeObservability, type SinkFactory } from './observability.node';
import type { CountMetrics, DurationMetrics } from '@laoban/observability';
import type { NodeLogSink } from './log.sinks';

type TestContext = 'exec' | 'config';

describe('createNodeObservability', () => {
    const fixedDate = new Date('2026-04-18T12:34:56.789Z');
    const now = () => fixedDate;

    it('can be created with no config', () => {
        const obs = createNodeObservability<TestContext>();

        expect(obs.correlationId).toBe('NoCorrelationId');
        expect(obs.module).toBeUndefined();
        expect(obs.debugLevels).toEqual({});
        expect(() => obs.logger('info', 'hello')).not.toThrow();
        expect(() => obs.debug('exec', 'debug', 'hello')).not.toThrow();
        expect(() => obs.countMetric('templates.rendered')).not.toThrow();
        expect(() => obs.durationMetric('compile', 12)).not.toThrow();
    });

    it('creates an observability with the supplied correlation id', () => {
        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            now,
        });

        expect(obs.correlationId).toBe('corr-123');
        expect(obs.module).toBeUndefined();
    });

    it('defaults debugLevels to an empty object', () => {
        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            now,
        });

        expect(obs.debugLevels).toEqual({});
    });

    it('writes logger output to all direct sinks', () => {
        const sink1 = jest.fn<void, [string | null | undefined, string]>();
        const sink2 = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink1, sink2],
            now,
        });

        obs.logger('info', 'hello');

        const expected = '2026-04-18T12:34:56.789Z INFO [corr-123] hello';
        expect(sink1).toHaveBeenCalledWith(undefined, expected);
        expect(sink2).toHaveBeenCalledWith(undefined, expected);
    });

    it('uses the sink factory for string sinks', () => {
        const producedSink = jest.fn<void, [string | null | undefined, string]>();
        const sinkFactory = jest.fn<NodeLogSink, [string]>() as jest.MockedFunction<SinkFactory>;
        sinkFactory.mockReturnValue(producedSink);

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: ['one.log', 'two.log'],
            sinkFactory,
            now,
        });

        obs.logger('info', 'hello');

        expect(sinkFactory).toHaveBeenCalledTimes(2);
        expect(sinkFactory).toHaveBeenNthCalledWith(1, 'one.log');
        expect(sinkFactory).toHaveBeenNthCalledWith(2, 'two.log');
        expect(producedSink).toHaveBeenCalledTimes(2);
        expect(producedSink).toHaveBeenCalledWith(undefined, '2026-04-18T12:34:56.789Z INFO [corr-123] hello');
    });

    it('uses direct sinks unchanged and only applies the sink factory to string sinks', () => {
        const directSink = jest.fn<void, [string | null | undefined, string]>();
        const producedSink = jest.fn<void, [string | null | undefined, string]>();
        const sinkFactory = jest.fn<NodeLogSink, [string]>() as jest.MockedFunction<SinkFactory>;
        sinkFactory.mockReturnValue(producedSink);

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [directSink, 'one.log'],
            sinkFactory,
            now,
        });

        obs.logger('info', 'hello');

        expect(sinkFactory).toHaveBeenCalledTimes(1);
        expect(sinkFactory).toHaveBeenCalledWith('one.log');
        expect(directSink).toHaveBeenCalledWith(undefined, '2026-04-18T12:34:56.789Z INFO [corr-123] hello');
        expect(producedSink).toHaveBeenCalledWith(undefined, '2026-04-18T12:34:56.789Z INFO [corr-123] hello');
    });

    it('does nothing safely when there are no sinks', () => {
        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            now,
        });

        expect(() => obs.logger('info', 'hello')).not.toThrow();
        expect(() => obs.debug('exec', 'debug', 'hello')).not.toThrow();
    });

    it('renders string messages using the dictionary', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            dictionary: { moduleName: 'package-a' },
            now,
        });

        obs.logger('info', 'compiling ${moduleName}');

        expect(sink).toHaveBeenCalledWith(
            undefined,
            '2026-04-18T12:34:56.789Z INFO [corr-123] compiling package-a'
        );
    });

    it('makes correlationId available in message templating', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
        });

        obs.logger('info', 'correlation=${correlationId}');

        expect(sink).toHaveBeenCalledWith(
            undefined,
            '2026-04-18T12:34:56.789Z INFO [corr-123] correlation=corr-123'
        );
    });

    it('safe-strings non-string message parts and joins them with spaces', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
        });

        obs.logger('warn', 'value', 42, false, { a: 1 });

        expect(sink).toHaveBeenCalledWith(
            undefined,
            '2026-04-18T12:34:56.789Z WARN [corr-123] value 42 false {"a":1}'
        );
    });

    it('uses the default log template when no custom template is supplied', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
        });

        obs.logger('error', 'boom');

        expect(sink).toHaveBeenCalledWith(
            undefined,
            '2026-04-18T12:34:56.789Z ERROR [corr-123] boom'
        );
    });

    it('uses a custom log template when supplied', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
            templates: {
                log: '[${level}] ${message} (${correlationId}) @ ${timestamp}',
            },
        });

        obs.logger('info', 'hello');

        expect(sink).toHaveBeenCalledWith(
            undefined,
            '[INFO] hello (corr-123) @ 2026-04-18T12:34:56.789Z'
        );
    });

    it('does not emit debug output when the level is not enabled for the context', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
            debugLevels: {
                exec: ['info'],
            },
        });

        obs.debug('exec', 'debug', 'hidden');

        expect(sink).not.toHaveBeenCalled();
    });

    it('emits debug output when the level is enabled for the context', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
            debugLevels: {
                exec: ['debug'],
            },
        });

        obs.debug('exec', 'debug', 'visible');

        expect(sink).toHaveBeenCalledWith(
            undefined,
            '2026-04-18T12:34:56.789Z DEBUG [corr-123] [exec] visible'
        );
    });

    it('uses a custom debug template when supplied', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
            debugLevels: {
                exec: ['debug'],
            },
            templates: {
                debug: 'ctx=${context} level=${level} msg=${message}',
            },
        });

        obs.debug('exec', 'debug', 'hello');

        expect(sink).toHaveBeenCalledWith(
            undefined,
            'ctx=exec level=DEBUG msg=hello'
        );
    });

    it('uses injected countMetrics when provided', () => {
        const counts: CountMetrics = {};

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            now,
            countMetrics: counts,
        });

        obs.countMetric('templates.rendered');
        obs.countMetric('templates.rendered');
        obs.countMetric('files.generated');

        expect(counts).toEqual({
            'templates.rendered': 2,
            'files.generated': 1,
        });
    });

    it('uses injected durationMetrics when provided', () => {
        const durations: DurationMetrics = {};

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            now,
            durationMetrics: durations,
        });

        obs.durationMetric('compile', 10);
        obs.durationMetric('compile', 15);
        obs.durationMetric('publish', 7);

        expect(durations).toEqual({
            compile: {
                count: 2,
                totalMs: 25,
            },
            publish: {
                count: 1,
                totalMs: 7,
            },
        });
    });

    it('uses null countMetric when countMetrics are not supplied', () => {
        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            now,
        });

        expect(() => obs.countMetric('templates.rendered')).not.toThrow();
    });

    it('uses null durationMetric when durationMetrics are not supplied', () => {
        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            now,
        });

        expect(() => obs.durationMetric('compile', 12)).not.toThrow();
    });

    it('keeps logger and debug separate while sharing the same sinks and base dictionary', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();

        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now,
            dictionary: { moduleName: 'package-a' },
            debugLevels: {
                exec: ['debug'],
            },
        });

        obs.logger('info', 'compile ${moduleName}');
        obs.debug('exec', 'debug', 'running ${moduleName}');

        expect(sink.mock.calls).toEqual([
            [undefined, '2026-04-18T12:34:56.789Z INFO [corr-123] compile package-a'],
            [undefined, '2026-04-18T12:34:56.789Z DEBUG [corr-123] [exec] running package-a'],
        ]);
    });

    it('uses NoCorrelationId in output when created with no config and a sink is provided later via explicit config path', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();
        const obs = createNodeObservability<TestContext>({
            correlationId: 'NoCorrelationId',
            sinks: [sink],
            now
        });

        obs.logger('info', 'hello');

        expect(sink).toHaveBeenCalledWith(
            undefined,
            '2026-04-18T12:34:56.789Z INFO [NoCorrelationId] hello'
        );
    });

    it('withModule returns a new observability for that module', () => {
        const sink = jest.fn<void, [string | null | undefined, string]>();
        const obs = createNodeObservability<TestContext>({
            correlationId: 'corr-123',
            sinks: [sink],
            now
        });

        const moduleObs = obs.withModule('alpha');

        expect(moduleObs).not.toBe(obs);
        expect(moduleObs.correlationId).toBe('corr-123');
        expect(moduleObs.module).toBe('alpha');
        expect(obs.module).toBeUndefined();

        moduleObs.logger('info', 'hello');

        expect(sink).toHaveBeenCalledWith(
            'alpha',
            '2026-04-18T12:34:56.789Z INFO [corr-123] hello'
        );
    });
});