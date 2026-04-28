import {
    defaultObservabilityContext,
    fixedTimeService,
    makeObservability,
    nullCountMetric,
    nullDurationMetric,
    nullLog,
    nullObservability,
    realTimeService,
    shouldDebug,
    type DebugLevels,
    type LogLevel,
    type Observability,
} from './observability'
import {defaultObservabilityTemplates} from './observability.log'

describe('shouldDebug', () => {
    it('returns false when the context is not configured', () => {
        const debugLevels: DebugLevels = {}

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(false)
    })

    it('returns false when the context has an empty list', () => {
        const debugLevels: DebugLevels = {exec: []}

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(false)
    })

    it('returns true when the level is enabled for the context', () => {
        const debugLevels: DebugLevels = {
            exec: ['debug', 'info'],
        }

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'info')).toBe(true)
    })

    it('returns false when the level is not enabled for the context', () => {
        const debugLevels: DebugLevels = {
            exec: ['info'],
        }

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(false)
        expect(shouldDebug(debugLevels, 'exec', 'warn')).toBe(false)
    })

    it('uses the levels for the requested context only', () => {
        const debugLevels: DebugLevels = {
            exec: ['debug'],
            config: ['warn'],
        }

        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(true)
        expect(shouldDebug(debugLevels, 'config', 'debug')).toBe(false)
        expect(shouldDebug(debugLevels, 'config', 'warn')).toBe(true)
    })

    it('works for all log levels', () => {
        const levels: LogLevel[] = ['error', 'warn', 'info', 'debug']
        const debugLevels: DebugLevels = {exec: levels}

        expect(shouldDebug(debugLevels, 'exec', 'error')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'warn')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'info')).toBe(true)
        expect(shouldDebug(debugLevels, 'exec', 'debug')).toBe(true)
    })
})

describe('nullLog', () => {
    it('does not throw for any message payload', () => {
        expect(() => nullLog('a message')).not.toThrow()
        expect(() => nullLog('a message', 1, true, {a: 1})).not.toThrow()
        expect(() => nullLog()).not.toThrow()
        expect(() => nullLog(['x'], {nested: {value: 1}})).not.toThrow()
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

describe('realTimeService', () => {
    it('returns a number', () => {
        expect(typeof realTimeService.now()).toBe('number')
    })

    it('returns a plausible current time in milliseconds', () => {
        const before = Date.now()
        const actual = realTimeService.now()
        const after = Date.now()

        expect(actual).toBeGreaterThanOrEqual(before)
        expect(actual).toBeLessThanOrEqual(after)
    })
})

describe('defaultObservabilityContext', () => {
    it('creates a default context', () => {
        const context = defaultObservabilityContext()

        expect(context.correlationId).toBe('none')
        expect(context.module).toBeUndefined()
        expect(context.debugLevels).toEqual({})
        expect(context.timeService).toBe(realTimeService)
        expect(context.templates).toEqual(defaultObservabilityTemplates)
        expect(context.dictionary).toEqual({})
    })

    it('uses supplied correlation id, debug levels and module', () => {
        const debugLevels: DebugLevels = {exec: ['debug']}

        const context = defaultObservabilityContext('corr-123', debugLevels, 'alpha')

        expect(context.correlationId).toBe('corr-123')
        expect(context.debugLevels).toBe(debugLevels)
        expect(context.module).toBe('alpha')
    })
})

describe('makeObservability', () => {
    it('creates an observability from context and target', () => {
        const writes: string[] = []
        const context = {
            ...defaultObservabilityContext('corr-123', {}, 'alpha'),
            timeService: fixedTimeService(100),
        }

        const obs = makeObservability({
            context,
            target: {
                write: msg => {
                    writes.push(msg)
                },
            },
        })

        expect(obs.correlationId).toBe('corr-123')
        expect(obs.module).toBe('alpha')
        expect(obs.debugLevels).toEqual({})
        expect(obs.timeService).toBe(context.timeService)
        expect(obs.templates).toBe(context.templates)
        expect(obs.dictionary).toBe(context.dictionary)
        expect(obs.countMetric).toBe(nullCountMetric)
        expect(obs.durationMetric).toBe(nullDurationMetric)
    })

    it('derives log from the target writer', () => {
        const writes: string[] = []
        const context = {
            ...defaultObservabilityContext('corr-123', {}, 'alpha'),
            timeService: fixedTimeService(100),
        }

        const obs = makeObservability({
            context,
            target: {
                write: msg => {
                    writes.push(msg)
                },
            },
        })

        obs.log('hello', 1, {a: true})

        expect(writes).toEqual([
            "00:00:00 INFO hello 1 {\"a\":true}\n"
        ])
    })

    it('renders string log messages as templates using the context dictionary', () => {
        const writes: string[] = []
        const context = {
            ...defaultObservabilityContext('corr-123', {}, 'alpha'),
            timeService: fixedTimeService(100),
            dictionary: {name: 'Phil'},
        }

        const obs = makeObservability({
            context,
            target: {
                write: msg => {
                    writes.push(msg)
                },
            },
        })

        obs.log('hello ${name}')

        expect(writes).toEqual([
            "00:00:00 INFO hello Phil\n"
        ])
    })

    it('does not write debug messages when the context/level is disabled', () => {
        const writes: string[] = []
        const context = {
            ...defaultObservabilityContext('corr-123', {exec: ['info']}, 'alpha'),
            timeService: fixedTimeService(100),
        }

        const obs = makeObservability({
            context,
            target: {
                write: msg => {
                    writes.push(msg)
                },
            },
        })

        obs.debug('exec', 'debug', 'hidden')

        expect(writes).toEqual([])
    })

    it('writes debug messages when the context/level is enabled', () => {
        const writes: string[] = []
        const context = {
            ...defaultObservabilityContext('corr-123', {exec: ['debug']}, 'alpha'),
            timeService: fixedTimeService(100),
        }

        const obs = makeObservability({
            context,
            target: {
                write: msg => {
                    writes.push(msg)
                },
            },
        })

        obs.debug('exec', 'debug', 'visible')

        expect(writes).toEqual([
            "00:00:00 DEBUG [exec] visible\n"
        ])
    })

    it('uses supplied metric functions', () => {
        const counts: string[] = []
        const durations: {name: string, durationMs: number}[] = []

        const obs = makeObservability({
            context: defaultObservabilityContext('corr-123'),
            target: {write: nullLog},
            countMetric: name => {
                counts.push(name)
            },
            durationMetric: (name, durationMs) => {
                durations.push({name, durationMs})
            },
        })

        obs.countMetric('count.one')
        obs.durationMetric('duration.one', 123)

        expect(counts).toEqual(['count.one'])
        expect(durations).toEqual([{name: 'duration.one', durationMs: 123}])
    })

    it('returns the target write result at runtime for testability', async () => {
        const promise = Promise.resolve()
        const write = jest.fn(() => promise)
        const context = defaultObservabilityContext('corr-123')

        const obs = makeObservability({
            context,
            target: {write},
        })

        const result = obs.log('hello') as any as  Promise<void>

        expect(result).toBe(promise)

        await result

        expect(write).toHaveBeenCalledTimes(1)
    })
})

describe('nullObservability', () => {
    it('uses the supplied correlation id', () => {
        const obs = nullObservability('corr-123')

        expect(obs.correlationId).toBe('corr-123')
    })

    it('defaults the correlation id to none', () => {
        const obs = nullObservability()

        expect(obs.correlationId).toBe('none')
    })

    it('defaults the module to undefined', () => {
        const obs = nullObservability('corr-123')

        expect(obs.module).toBeUndefined()
    })

    it('has empty debug levels', () => {
        const obs = nullObservability('corr-123')

        expect(obs.debugLevels).toEqual({})
    })

    it('uses the real time service', () => {
        const obs = nullObservability('corr-123')

        expect(obs.timeService).toBe(realTimeService)
    })

    it('uses default templates and an empty dictionary', () => {
        const obs = nullObservability('corr-123')

        expect(obs.templates).toEqual(defaultObservabilityTemplates)
        expect(obs.dictionary).toEqual({})
    })

    it('provides a callable time service', () => {
        const obs = nullObservability('corr-123')

        expect(typeof obs.timeService.now()).toBe('number')
    })

    it('provides callable no-op functions', () => {
        const obs = nullObservability('corr-123')

        expect(() => obs.log('hello')).not.toThrow()
        expect(() => obs.debug('exec', 'debug', 'hello')).not.toThrow()
        expect(() => obs.countMetric('count.name')).not.toThrow()
        expect(() => obs.durationMetric('duration.name', 55)).not.toThrow()
    })

    it('returns an object matching the Observability shape', () => {
        const obs: Observability = nullObservability('corr-123')

        expect(obs.correlationId).toBe('corr-123')
        expect(obs.module).toBeUndefined()
        expect(typeof obs.log).toBe('function')
        expect(typeof obs.debug).toBe('function')
        expect(typeof obs.countMetric).toBe('function')
        expect(typeof obs.durationMetric).toBe('function')
        expect(typeof obs.timeService.now).toBe('function')
        expect(obs.debugLevels).toEqual({})
        expect(obs.templates).toEqual(defaultObservabilityTemplates)
        expect(obs.dictionary).toEqual({})
    })

    it('creates independent instances', () => {
        const obs1 = nullObservability('corr-1')
        const obs2 = nullObservability('corr-2')

        expect(obs1).not.toBe(obs2)
        expect(obs1.correlationId).toBe('corr-1')
        expect(obs2.correlationId).toBe('corr-2')
        expect(obs1.debugLevels).not.toBe(obs2.debugLevels)
        expect(obs1.dictionary).not.toBe(obs2.dictionary)
    })
})