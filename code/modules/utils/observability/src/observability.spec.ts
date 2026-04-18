import {
    nullCountMetric,
    nullDurationMetric,
    nullLogger,
    nullObservability,
    shouldDebug,
    type DebugLevels,
    type LogLevel,
    type Observability,
} from './observability'

type TestContext = 'exec' | 'config' | 'fs'

describe('shouldDebug', () => {
    it('returns false when the context is not configured', () => {
        const debugLevels: DebugLevels<TestContext> = {}

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(false)
    })

    it('returns false when the context has an empty list', () => {
        const debugLevels: DebugLevels<TestContext> = { exec: [] }

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(false)
    })

    it('returns true when the level is enabled for the context', () => {
        const debugLevels: DebugLevels<TestContext> = {
            exec: ['debug', 'info'],
        }

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'info')).toBe(true)
    })

    it('returns false when the level is not enabled for the context', () => {
        const debugLevels: DebugLevels<TestContext> = {
            exec: ['info'],
        }

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(false)
        expect(shouldDebug(debugLevels, 'exec', 'warn')).toBe(false)
    })

    it('uses the levels for the requested context only', () => {
        const debugLevels: DebugLevels<TestContext> = {
            exec: ['debug'],
            config: ['warn'],
        }

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(true)
        expect(shouldDebug(debugLevels, 'config', 'debug')).toBe(false)
        expect(shouldDebug(debugLevels, 'config', 'warn')).toBe(true)
    })

    it('works for all log levels', () => {
        const levels: LogLevel[] = ['error', 'warn', 'info', 'debug']
        const debugLevels: DebugLevels<TestContext> = { exec: levels }

        expect(shouldDebug(debugLevels, 'exec', 'error')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'warn')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'info')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(true)
    })
})

describe('nullLogger', () => {
    it('does not throw for any log level or message payload', () => {
        expect(() => nullLogger('error', 'a message')).not.toThrow()
        expect(() => nullLogger('warn', 'a message', 1, true, { a: 1 })).not.toThrow()
        expect(() => nullLogger('info')).not.toThrow()
        expect(() => nullLogger('debug', ['x'], { nested: { value: 1 } })).not.toThrow()
    })
})

describe('nullCountMetric', () => {
    it('does not throw', () => {
        expect(() => nullCountMetric('count.name')).not.toThrow()
    })
})

describe('nullDurationMetric', () => {
    it('does not throw', () => {
        expect(() => nullDurationMetric('duration.name', 123)).not.toThrow()
    })
})

describe('nullObservability', () => {
    it('uses the supplied correlation id', () => {
        const obs = nullObservability<TestContext>('corr-123')

        expect(obs.correlationId).toBe('corr-123')
    })

    it('defaults the correlation id to none', () => {
        const obs = nullObservability<TestContext>()

        expect(obs.correlationId).toBe('none')
    })

    it('has empty debug levels', () => {
        const obs = nullObservability<TestContext>('corr-123')

        expect(obs.debugLevels).toEqual({})
    })

    it('provides callable no-op functions', () => {
        const obs = nullObservability<TestContext>('corr-123')

        expect(() => obs.logger('info', 'hello')).not.toThrow()
        expect(() => obs.debug('exec', 'debug', 'hello')).not.toThrow()
        expect(() => obs.countMetric('count.name')).not.toThrow()
        expect(() => obs.durationMetric('duration.name', 55)).not.toThrow()
    })

    it('returns an object matching the Observability shape', () => {
        const obs: Observability<TestContext> = nullObservability<TestContext>('corr-123')

        expect(obs.correlationId).toBe('corr-123')
        expect(typeof obs.logger).toBe('function')
        expect(typeof obs.debug).toBe('function')
        expect(typeof obs.countMetric).toBe('function')
        expect(typeof obs.durationMetric).toBe('function')
        expect(obs.debugLevels).toEqual({})
    })

    it('creates independent instances', () => {
        const obs1 = nullObservability<TestContext>('corr-1')
        const obs2 = nullObservability<TestContext>('corr-2')

        expect(obs1).not.toBe(obs2)
        expect(obs1.correlationId).toBe('corr-1')
        expect(obs2.correlationId).toBe('corr-2')
        expect(obs1.debugLevels).not.toBe(obs2.debugLevels)
    })
})