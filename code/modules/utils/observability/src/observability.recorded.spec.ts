import {ModuleName, ModuleObservabilityScope, steppingTimeService} from "./observability"
import {recordingObservability} from "./observability.recorded"
import {DebugConfig} from "./observability.debug"

const scope = (
    module: ModuleName,
    directory: string = String(module ?? "."),
): ModuleObservabilityScope => ({
    module,
    directory,
})

describe("recordingObservability", () => {
    it("starts empty", () => {
        const recorded = recordingObservability()

        expect(recorded.logs).toEqual([])
        expect(recorded.debug).toEqual([])
        expect(recorded.counts).toEqual([])
        expect(recorded.durations).toEqual([])
    })

    it("records rendered log messages", () => {
        const recorded = recordingObservability(
            {},
            "corr-123",
            steppingTimeService(100, 5),
        )

        recorded.observability.log("hello", 1, {a: true})
        recorded.observability.log("bad news")

        expect(recorded.logs).toEqual([
            {moduleScope: scope(undefined), msg: '00:00:00 INFO hello 1 {"a":true}\n'},
            {moduleScope: scope(undefined), msg: "00:00:00 INFO bad news\n"},
        ])
    })

    it("records debug calls with module scope, debugName, rendered context and level", () => {
        const recorded = recordingObservability(
            {
                load: {
                    debug: [],
                },
                findContainingDirectory: {
                    info: [],
                },
            },
            "corr-123",
            steppingTimeService(100, 5),
        )

        recorded.observability.debug(["load"], "debug", "loading file", "a.txt")
        recorded.observability.debug(
            ["findContainingDirectory"],
            "info",
            "checking",
            "/tmp/laoban.json",
        )

        expect(recorded.debug).toEqual([
            {
                moduleScope: scope(undefined),
                debugName: ["load"],
                context: "load",
                level: "debug",
                msg: ["loading file", "a.txt"],
            },
            {
                moduleScope: scope(undefined),
                debugName: ["findContainingDirectory"],
                context: "findContainingDirectory",
                level: "info",
                msg: ["checking", "/tmp/laoban.json"],
            },
        ])
    })

    it("records rendered debug lines only when enabled", () => {
        const recorded = recordingObservability(
            {
                load: {
                    debug: [],
                },
                exec: {
                    info: [],
                },
            },
            "corr-123",
            steppingTimeService(100, 5),
        )

        recorded.observability.debug(["load"], "debug", "loading")
        recorded.observability.debug(["exec"], "debug", "hidden")
        recorded.observability.debug(["exec"], "info", "visible")

        expect(recorded.logs).toEqual([
            {moduleScope: scope(undefined), msg: "00:00:00 DEBUG [load] loading\n"},
            {moduleScope: scope(undefined), msg: "00:00:00 INFO [exec] visible\n"},
        ])

        // The recording wrapper records debug calls before filtering.
        expect(recorded.debug).toEqual([
            {
                moduleScope: scope(undefined),
                debugName: ["load"],
                context: "load",
                level: "debug",
                msg: ["loading"],
            },
            {
                moduleScope: scope(undefined),
                debugName: ["exec"],
                context: "exec",
                level: "debug",
                msg: ["hidden"],
            },
            {
                moduleScope: scope(undefined),
                debugName: ["exec"],
                context: "exec",
                level: "info",
                msg: ["visible"],
            },
        ])
    })

    it("records child debug lines when the whole area is enabled", () => {
        const recorded = recordingObservability(
            {
                script: {
                    debug: [],
                },
            },
            "corr-123",
            steppingTimeService(100, 5),
        )

        recorded.observability.debug(["script"], "debug", "root")
        recorded.observability.debug(["script", "type1"], "debug", "type1")
        recorded.observability.debug(["script", "type2"], "debug", "type2")

        expect(recorded.logs).toEqual([
            {moduleScope: scope(undefined), msg: "00:00:00 DEBUG [script] root\n"},
            {moduleScope: scope(undefined), msg: "00:00:00 DEBUG [script:type1] type1\n"},
            {moduleScope: scope(undefined), msg: "00:00:00 DEBUG [script:type2] type2\n"},
        ])
    })

    it("records only configured child debug lines when a child path is enabled", () => {
        const recorded = recordingObservability(
            {
                template: {
                    debug: [["parse"]],
                },
            },
            "corr-123",
            steppingTimeService(100, 5),
        )

        recorded.observability.debug(["template"], "debug", "hidden root")
        recorded.observability.debug(["template", "parse"], "debug", "parse")
        recorded.observability.debug(["template", "parse", "tokens"], "debug", "tokens")
        recorded.observability.debug(["template", "render"], "debug", "hidden render")

        expect(recorded.logs).toEqual([
            {moduleScope: scope(undefined), msg: "00:00:00 DEBUG [template:parse] parse\n"},
            {moduleScope: scope(undefined), msg: "00:00:00 DEBUG [template:parse:tokens] tokens\n"},
        ])
    })

    it("records count metrics", () => {
        const recorded = recordingObservability()

        recorded.observability.countMetric("fileops.load.file.success")
        recorded.observability.countMetric("fileops.load.file.success")
        recorded.observability.countMetric("fileops.load.url.failure")

        expect(recorded.counts).toEqual([
            "fileops.load.file.success",
            "fileops.load.file.success",
            "fileops.load.url.failure",
        ])
    })

    it("records duration metrics", () => {
        const recorded = recordingObservability()

        recorded.observability.durationMetric("fileops.load.file.ms", 12)
        recorded.observability.durationMetric("fileops.load.url.ms", 7)

        expect(recorded.durations).toEqual([
            {name: "fileops.load.file.ms", durationMs: 12},
            {name: "fileops.load.url.ms", durationMs: 7},
        ])
    })

    it("preserves the supplied correlation id", () => {
        const recorded = recordingObservability(
            {},
            "corr-123",
        )

        expect(recorded.observability.correlationId).toBe("corr-123")
    })

    it("preserves the supplied debug config", () => {
        const debugConfig: DebugConfig = {
            load: {
                debug: [],
            },
            findContainingDirectory: {
                info: [],
                debug: [],
            },
            template: {
                debug: [["parse"]],
            },
        }

        const recorded = recordingObservability(debugConfig)

        expect(recorded.observability.debugConfig).toBe(debugConfig)
    })

    it("preserves the supplied time service", () => {
        const timeService = steppingTimeService(100, 5)
        const recorded = recordingObservability(
            {},
            "corr-123",
            timeService,
        )

        expect(recorded.observability.timeService).toBe(timeService)
    })

    it("preserves the supplied module scope", () => {
        const moduleScope = scope("alpha", "modules/alpha")

        const recorded = recordingObservability(
            {},
            "corr-123",
            steppingTimeService(100, 5),
            moduleScope,
        )

        expect(recorded.observability.moduleScope).toBe(moduleScope)
        expect(recorded.observability.moduleScope.module).toBe("alpha")
        expect(recorded.observability.moduleScope.directory).toBe("modules/alpha")
    })

    it("defaults the module scope", () => {
        const recorded = recordingObservability()

        expect(recorded.observability.moduleScope).toEqual(scope(undefined))
    })

    it("uses the supplied time service for deterministic time", () => {
        const recorded = recordingObservability(
            {},
            "corr-123",
            steppingTimeService(100, 5),
        )

        expect(recorded.observability.timeService.now()).toBe(100)
        expect(recorded.observability.timeService.now()).toBe(105)
        expect(recorded.observability.timeService.now()).toBe(110)
    })

    it("uses one shared recording surface for all observability methods", () => {
        const recorded = recordingObservability(
            {
                load: {
                    debug: [],
                },
            },
            "corr-123",
            steppingTimeService(100, 5),
        )

        recorded.observability.log("warning")
        recorded.observability.debug(["load"], "debug", "loading")
        recorded.observability.countMetric("metric.one")
        recorded.observability.durationMetric("metric.ms", 5)

        expect(recorded.logs).toEqual([
            {moduleScope: scope(undefined), msg: "00:00:00 INFO warning\n"},
            {moduleScope: scope(undefined), msg: "00:00:00 DEBUG [load] loading\n"},
        ])

        expect(recorded.debug).toEqual([
            {
                moduleScope: scope(undefined),
                debugName: ["load"],
                context: "load",
                level: "debug",
                msg: ["loading"],
            },
        ])

        expect(recorded.counts).toEqual(["metric.one"])
        expect(recorded.durations).toEqual([
            {name: "metric.ms", durationMs: 5},
        ])
    })

    it("records the configured module scope on log and debug", () => {
        const moduleScope = scope("alpha", "modules/alpha")

        const recorded = recordingObservability(
            {
                load: {
                    debug: [],
                },
            },
            "corr-123",
            steppingTimeService(100, 5),
            moduleScope,
        )

        recorded.observability.log("hello")
        recorded.observability.debug(["load"], "debug", "details")

        expect(recorded.logs).toEqual([
            {moduleScope, msg: "00:00:00 INFO hello\n"},
            {moduleScope, msg: "00:00:00 DEBUG [load] details\n"},
        ])

        expect(recorded.debug).toEqual([
            {
                moduleScope,
                debugName: ["load"],
                context: "load",
                level: "debug",
                msg: ["details"],
            },
        ])
    })
})