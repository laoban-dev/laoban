import {
    defaultModuleObservabilityScope,
    defaultObservabilityContext,
    fixedTimeService,
    makeObservability,
    nullCountMetric,
    nullDurationMetric,
    nullLog,
    nullObservability,
    realTimeService,
    type ModuleName,
    type ModuleObservabilityScope,
    type Observability,
} from "./observability"
import {
    emptyDebugConfig,
    shouldDebug,
    type DebugConfig,
    type LogLevel,
} from "./observability.debug"
import {defaultObservabilityTemplates} from "./observability.log"

const scope = (
    module: ModuleName,
    directory: string = String(module ?? "."),
): ModuleObservabilityScope => ({
    module,
    directory,
})

describe("shouldDebug", () => {
    it("returns false when the area is not configured", () => {
        const debugConfig: DebugConfig = {}

        expect(shouldDebug(debugConfig, ["exec"], "debug")).toBe(false)
    })

    it("returns true when the area has an empty list for the level", () => {
        const debugConfig: DebugConfig = {
            exec: {
                debug: [],
            },
        }

        expect(shouldDebug(debugConfig, ["exec"], "debug")).toBe(true)
        expect(shouldDebug(debugConfig, ["exec", "plan"], "debug")).toBe(true)
        expect(shouldDebug(debugConfig, ["exec", "run", "child"], "debug")).toBe(true)
    })

    it("returns false when the area exists but the level is not configured", () => {
        const debugConfig: DebugConfig = {
            exec: {
                info: [],
            },
        }

        expect(shouldDebug(debugConfig, ["exec"], "debug")).toBe(false)
        expect(shouldDebug(debugConfig, ["exec", "plan"], "debug")).toBe(false)
    })

    it("returns true when the requested child path is enabled for the level", () => {
        const debugConfig: DebugConfig = {
            template: {
                debug: [["parse"]],
            },
        }

        expect(shouldDebug(debugConfig, ["template", "parse"], "debug")).toBe(true)
        expect(shouldDebug(debugConfig, ["template", "parse", "tokens"], "debug")).toBe(true)
    })

    it("returns false when only a different child path is enabled", () => {
        const debugConfig: DebugConfig = {
            template: {
                debug: [["parse"]],
            },
        }

        expect(shouldDebug(debugConfig, ["template"], "debug")).toBe(false)
        expect(shouldDebug(debugConfig, ["template", "render"], "debug")).toBe(false)
    })

    it("uses the configuration for the requested area only", () => {
        const debugConfig: DebugConfig = {
            exec: {
                debug: [],
            },
            config: {
                warn: [],
            },
        }

        expect(shouldDebug(debugConfig, ["exec"], "debug")).toBe(true)
        expect(shouldDebug(debugConfig, ["config"], "debug")).toBe(false)
        expect(shouldDebug(debugConfig, ["config"], "warn")).toBe(true)
    })

    it("works for all log levels", () => {
        const levels: LogLevel[] = ["error", "warn", "info", "debug"]

        const debugConfig: DebugConfig = {
            exec: {
                error: [],
                warn: [],
                info: [],
                debug: [],
            },
        }

        levels.forEach(level => {
            expect(shouldDebug(debugConfig, ["exec"], level)).toBe(true)
            expect(shouldDebug(debugConfig, ["exec", "child"], level)).toBe(true)
        })
    })

    it("does not use string-prefix matching", () => {
        const debugConfig: DebugConfig = {
            script: {
                debug: [],
            },
        }

        expect(shouldDebug(debugConfig, ["script"], "debug")).toBe(true)
        expect(shouldDebug(debugConfig, ["script", "type1"], "debug")).toBe(true)
        expect(shouldDebug(debugConfig, ["scripted"], "debug")).toBe(false)
    })
})

describe("nullLog", () => {
    it("does not throw for any message payload", () => {
        expect(() => nullLog("a message")).not.toThrow()
        expect(() => nullLog("a message", 1, true, {a: 1})).not.toThrow()
        expect(() => nullLog()).not.toThrow()
        expect(() => nullLog(["x"], {nested: {value: 1}})).not.toThrow()
    })
})

describe("nullCountMetric", () => {
    it("does not throw", () => {
        expect(() => nullCountMetric("count.name")).not.toThrow()
    })
})

describe("nullDurationMetric", () => {
    it("does not throw", () => {
        expect(() => nullDurationMetric("duration.name", 123)).not.toThrow()
    })
})

describe("realTimeService", () => {
    it("returns a number", () => {
        expect(typeof realTimeService.now()).toBe("number")
    })

    it("returns a plausible current time in milliseconds", () => {
        const before = Date.now()
        const actual = realTimeService.now()
        const after = Date.now()

        expect(actual).toBeGreaterThanOrEqual(before)
        expect(actual).toBeLessThanOrEqual(after)
    })
})

describe("defaultObservabilityContext", () => {
    it("creates a default context", () => {
        const context = defaultObservabilityContext()

        expect(context.correlationId).toBe("none")
        expect(context.moduleScope).toEqual(defaultModuleObservabilityScope())
        expect(context.debugConfig).toEqual(emptyDebugConfig)
        expect(context.timeService).toBe(realTimeService)
        expect(context.observabilityTemplates).toEqual(defaultObservabilityTemplates)
        expect(context.dictionary).toEqual({})
    })

    it("uses supplied correlation id, debug config and module scope", () => {
        const debugConfig: DebugConfig = {
            exec: {
                debug: [],
            },
        }
        const moduleScope = scope("alpha", "modules/alpha")

        const context = defaultObservabilityContext("corr-123", debugConfig, moduleScope)

        expect(context.correlationId).toBe("corr-123")
        expect(context.debugConfig).toBe(debugConfig)
        expect(context.moduleScope).toBe(moduleScope)
        expect(context.moduleScope.module).toBe("alpha")
        expect(context.moduleScope.directory).toBe("modules/alpha")
    })
})

describe("makeObservability", () => {
    it("creates an observability from context and target", () => {
        const writes: string[] = []

        const context = {
            ...defaultObservabilityContext("corr-123", emptyDebugConfig, scope("alpha", "modules/alpha")),
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

        expect(obs.correlationId).toBe("corr-123")
        expect(obs.moduleScope).toBe(context.moduleScope)
        expect(obs.moduleScope.module).toBe("alpha")
        expect(obs.debugConfig).toEqual(emptyDebugConfig)
        expect(obs.timeService).toBe(context.timeService)
        expect(obs.observabilityTemplates).toBe(context.observabilityTemplates)
        expect(obs.dictionary).toBe(context.dictionary)
        expect(obs.countMetric).toBe(nullCountMetric)
        expect(obs.durationMetric).toBe(nullDurationMetric)
    })

    it("derives log from the target writer", () => {
        const writes: string[] = []

        const context = {
            ...defaultObservabilityContext("corr-123", emptyDebugConfig, scope("alpha", "modules/alpha")),
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

        obs.log("hello", 1, {a: true})

        expect(writes).toEqual([
            "00:00:00 INFO hello 1 {\"a\":true}\n",
        ])
    })

    it("renders string log messages as templates using the context dictionary", () => {
        const writes: string[] = []

        const context = {
            ...defaultObservabilityContext("corr-123", emptyDebugConfig, scope("alpha", "modules/alpha")),
            timeService: fixedTimeService(100),
            dictionary: {name: "Phil"},
        }

        const obs = makeObservability({
            context,
            target: {
                write: msg => {
                    writes.push(msg)
                },
            },
        })

        obs.log("hello ${name}")

        expect(writes).toEqual([
            "00:00:00 INFO hello Phil\n",
        ])
    })

    it("does not write debug messages when the area/level is disabled", () => {
        const writes: string[] = []

        const context = {
            ...defaultObservabilityContext(
                "corr-123",
                {
                    exec: {
                        info: [],
                    },
                },
                scope("alpha", "modules/alpha"),
            ),
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

        obs.debug(["exec"], "debug", "hidden")

        expect(writes).toEqual([])
    })

    it("writes debug messages when the whole area is enabled", () => {
        const writes: string[] = []

        const context = {
            ...defaultObservabilityContext(
                "corr-123",
                {
                    exec: {
                        debug: [],
                    },
                },
                scope("alpha", "modules/alpha"),
            ),
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

        obs.debug(["exec", "plan"], "debug", "visible")

        expect(writes).toEqual([
            "00:00:00 DEBUG [exec:plan] visible\n",
        ])
    })

    it("writes debug messages when the configured child path is enabled", () => {
        const writes: string[] = []

        const context = {
            ...defaultObservabilityContext(
                "corr-123",
                {
                    template: {
                        debug: [["parse"]],
                    },
                },
                scope("alpha", "modules/alpha"),
            ),
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

        obs.debug(["template", "parse"], "debug", "visible")
        obs.debug(["template", "render"], "debug", "hidden")

        expect(writes).toEqual([
            "00:00:00 DEBUG [template:parse] visible\n",
        ])
    })

    it("uses supplied metric functions", () => {
        const counts: string[] = []
        const durations: {name: string, durationMs: number}[] = []

        const obs = makeObservability({
            context: defaultObservabilityContext("corr-123"),
            target: {write: nullLog},
            countMetric: name => {
                counts.push(name)
            },
            durationMetric: (name, durationMs) => {
                durations.push({name, durationMs})
            },
        })

        obs.countMetric("count.one")
        obs.durationMetric("duration.one", 123)

        expect(counts).toEqual(["count.one"])
        expect(durations).toEqual([{name: "duration.one", durationMs: 123}])
    })

    it("returns the target write result at runtime for testability", async () => {
        const promise = Promise.resolve()
        const write = jest.fn(() => promise)
        const context = defaultObservabilityContext("corr-123")

        const obs = makeObservability({
            context,
            target: {write},
        })

        const result = obs.log("hello") as any as Promise<void>

        expect(result).toBe(promise)

        await result

        expect(write).toHaveBeenCalledTimes(1)
    })
})

describe("nullObservability", () => {
    it("uses the supplied correlation id", () => {
        const obs = nullObservability("corr-123")

        expect(obs.correlationId).toBe("corr-123")
    })

    it("defaults the correlation id to none", () => {
        const obs = nullObservability()

        expect(obs.correlationId).toBe("none")
    })

    it("defaults the module scope to an empty default", () => {
        const obs = nullObservability("corr-123")

        expect(obs.moduleScope).toEqual(defaultModuleObservabilityScope())
        expect(obs.moduleScope.module).toBeUndefined()
    })

    it("has empty debug config", () => {
        const obs = nullObservability("corr-123")

        expect(obs.debugConfig).toEqual(emptyDebugConfig)
    })

    it("uses the real time service", () => {
        const obs = nullObservability("corr-123")

        expect(obs.timeService).toBe(realTimeService)
    })

    it("uses default templates and an empty dictionary", () => {
        const obs = nullObservability("corr-123")

        expect(obs.observabilityTemplates).toEqual(defaultObservabilityTemplates)
        expect(obs.dictionary).toEqual({})
    })

    it("provides a callable time service", () => {
        const obs = nullObservability("corr-123")

        expect(typeof obs.timeService.now()).toBe("number")
    })

    it("provides callable no-op functions", () => {
        const obs = nullObservability("corr-123")

        expect(() => obs.log("hello")).not.toThrow()
        expect(() => obs.debug(["exec"], "debug", "hello")).not.toThrow()
        expect(() => obs.countMetric("count.name")).not.toThrow()
        expect(() => obs.durationMetric("duration.name", 55)).not.toThrow()
    })

    it("returns an object matching the Observability shape", () => {
        const obs: Observability = nullObservability("corr-123")

        expect(obs.correlationId).toBe("corr-123")
        expect(obs.moduleScope.module).toBeUndefined()
        expect(typeof obs.log).toBe("function")
        expect(typeof obs.debug).toBe("function")
        expect(typeof obs.countMetric).toBe("function")
        expect(typeof obs.durationMetric).toBe("function")
        expect(typeof obs.timeService.now).toBe("function")
        expect(obs.debugConfig).toEqual(emptyDebugConfig)
        expect(obs.observabilityTemplates).toEqual(defaultObservabilityTemplates)
        expect(obs.dictionary).toEqual({})
    })

    it("creates independent instances", () => {
        const obs1 = nullObservability("corr-1")
        const obs2 = nullObservability("corr-2")

        expect(obs1).not.toBe(obs2)
        expect(obs1.correlationId).toBe("corr-1")
        expect(obs2.correlationId).toBe("corr-2")

        // debugConfig is immutable/read-only and may safely share the empty singleton.
        expect(obs1.debugConfig).toEqual({})
        expect(obs2.debugConfig).toEqual({})

        // dictionary should still be per-instance because callers may extend/replace it in derived contexts.
        expect(obs1.dictionary).not.toBe(obs2.dictionary)
    })
})