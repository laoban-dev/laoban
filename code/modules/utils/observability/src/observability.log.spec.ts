import {
    defaultObservabilityTemplates,
    effectiveLogDictionaryContext,
    makeLogDictionary,
    renderMessages,
    renderObservabilityLine,
    renderOneMessage,
    renderTemplateSafely,
} from "./observability.log"
import {fixedTimeService, steppingTimeService} from "./observability"

describe("effectiveLogDictionaryContext", () => {
    it("applies defaults when no context is supplied", () => {
        const result = effectiveLogDictionaryContext()

        expect(result.timeService.now()).toEqual(expect.any(Number))
        expect(result.templates).toEqual(defaultObservabilityTemplates)
        expect(result.dictionary).toEqual({})
    })

    it("preserves supplied time service", () => {
        const timeService = fixedTimeService(123)

        const result = effectiveLogDictionaryContext({timeService})

        expect(result.timeService).toBe(timeService)
        expect(result.timeService.now()).toBe(123)
    })

    it("merges partial templates over defaults", () => {
        const result = effectiveLogDictionaryContext({
            templates: {
                log: "LOG ${message}",
            },
        })

        expect(result.templates).toEqual({
            log: "LOG ${message}",
            debug: defaultObservabilityTemplates.debug,
        })
    })

    it("preserves supplied dictionary", () => {
        const dictionary = {app: "laoban", env: "test"}

        const result = effectiveLogDictionaryContext({dictionary})

        expect(result.dictionary).toBe(dictionary)
    })
})

describe("renderTemplateSafely", () => {
    it("renders templates using the real template engine", () => {
        const result = renderTemplateSafely("Hello ${name}", {name: "Phil"})

        expect(result).toBe("Hello Phil")
    })

    it("supports default template functions from the real template engine", () => {
        const result = renderTemplateSafely("Hello ${name|toUpperCase}", {name: "Phil"})

        expect(result).toBe("Hello PHIL")
    })

    it("returns the original template when rendering fails", () => {
        const result = renderTemplateSafely("Hello ${missing.value}", {})

        expect(result).toBe("Hello ${missing.value}")
    })
})

describe("renderOneMessage", () => {
    it("renders string messages as templates", () => {
        const result = renderOneMessage("Hello ${name}", {name: "Phil"})

        expect(result).toBe("Hello Phil")
    })

    it("renders non-string messages with safeString", () => {
        expect(renderOneMessage(123, {})).toBe("123")
        expect(renderOneMessage(true, {})).toBe("true")
        expect(renderOneMessage({a: 1}, {})).toBe('{"a":1}')
    })
})

describe("renderMessages", () => {
    it("renders message parts and joins them with spaces", () => {
        const result = renderMessages(
            ["Hello ${name}", 123, {ok: true}],
            {name: "Phil"}
        )

        expect(result).toBe('Hello Phil 123 {"ok":true}')
    })

    it("returns an empty string for no messages", () => {
        expect(renderMessages([], {})).toBe("")
    })
})

describe("makeLogDictionary", () => {
    it("builds a dictionary with defaults", () => {
        const result = makeLogDictionary({
            correlationId: "corr-123",
            module: "alpha",
        })

        expect(result).toEqual({
            correlationId: "corr-123",
            module: "alpha",
            timestamp: expect.any(Number),
            context: undefined,
        })
    })

    it("uses the supplied time service", () => {
        const result = makeLogDictionary({
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(500),
        })

        expect(result.timestamp).toBe(500)
    })

    it("includes debug context when supplied", () => {
        const result = makeLogDictionary({
            correlationId: "corr-123",
            module: "alpha",
            context: "load",
            timeService: fixedTimeService(500),
        })

        expect(result).toEqual({
            correlationId: "corr-123",
            module: "alpha",
            timestamp: 500,
            context: "load",
        })
    })

    it("includes custom dictionary values", () => {
        const result = makeLogDictionary({
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(500),
            dictionary: {
                app: "laoban",
                env: "test",
            },
        })

        expect(result).toEqual({
            app: "laoban",
            env: "test",
            correlationId: "corr-123",
            module: "alpha",
            timestamp: 500,
            context: undefined,
        })
    })

    it("correlation id, module, timestamp and context override custom dictionary values", () => {
        const result = makeLogDictionary({
            correlationId: "corr-actual",
            module: "module-actual",
            context: "context-actual",
            timeService: fixedTimeService(500),
            dictionary: {
                correlationId: "corr-from-dict",
                module: "module-from-dict",
                timestamp: 999,
                context: "context-from-dict",
            },
        })

        expect(result).toEqual({
            correlationId: "corr-actual",
            module: "module-actual",
            timestamp: 500,
            context: "context-actual",
        })
    })
})

describe("renderObservabilityLine", () => {
    it("renders a log line with default log template", () => {
        const result = renderObservabilityLine({
            template: "log",
            level: "info",
            msg: ["Started ${app}", {ok: true}],
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(1000),
            dictionary: {
                app: "laoban",
            },
        })

        expect(result).toBe('1000 INFO [corr-123] Started laoban {"ok":true}')
    })

    it("renders a debug line with default debug template", () => {
        const result = renderObservabilityLine({
            template: "debug",
            level: "debug",
            context: "load",
            msg: ["Loading ${file}"],
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(1000),
            dictionary: {
                file: "package.details.json",
            },
        })

        expect(result).toBe("1000 DEBUG [corr-123] [load] Loading package.details.json")
    })

    it("uses custom templates", () => {
        const result = renderObservabilityLine({
            template: "log",
            level: "warn",
            msg: ["Careful ${name}"],
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(1000),
            dictionary: {
                name: "Phil",
            },
            templates: {
                log: "${level}:${module}:${message}",
            },
        })

        expect(result).toBe("WARN:alpha:Careful Phil")
    })

    it("keeps the default template for the other template kind when only one is overridden", () => {
        const result = renderObservabilityLine({
            template: "debug",
            level: "debug",
            context: "exec",
            msg: ["Running"],
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(1000),
            templates: {
                log: "${message}",
            },
        })

        expect(result).toBe("1000 DEBUG [corr-123] [exec] Running")
    })

    it("supports template functions inside message strings", () => {
        const result = renderObservabilityLine({
            template: "log",
            level: "info",
            msg: ["Hello ${name|toUpperCase}"],
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(1000),
            dictionary: {
                name: "Phil",
            },
        })

        expect(result).toBe("1000 INFO [corr-123] Hello PHIL")
    })

    it("uses a fresh timestamp from the time service for each render", () => {
        const timeService = steppingTimeService(100, 5)

        const first = renderObservabilityLine({
            template: "log",
            level: "info",
            msg: ["first"],
            correlationId: "corr-123",
            module: "alpha",
            timeService,
        })

        const second = renderObservabilityLine({
            template: "log",
            level: "info",
            msg: ["second"],
            correlationId: "corr-123",
            module: "alpha",
            timeService,
        })

        expect(first).toBe("100 INFO [corr-123] first")
        expect(second).toBe("105 INFO [corr-123] second")
    })

    it("allows custom template fields from dictionary", () => {
        const result = renderObservabilityLine({
            template: "log",
            level: "info",
            msg: ["hello"],
            correlationId: "corr-123",
            module: "alpha",
            timeService: fixedTimeService(1000),
            dictionary: {
                app: "laoban",
            },
            templates: {
                log: "${app}:${timestamp}:${level}:${message}",
            },
        })

        expect(result).toBe("laoban:1000:INFO:hello")
    })
})