import {steppingTimeService} from "./observability";
import {recordingObservability} from "./observability.recorded";

describe("recordingObservability", () => {
    it("starts empty", () => {
        const recorded = recordingObservability();

        expect(recorded.logs).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
    });

    it("records log messages", () => {
        const recorded = recordingObservability();

        recorded.observability.logger("info", "hello", 1, { a: true });
        recorded.observability.logger("error", "bad news");

        expect(recorded.logs).toEqual([
            { level: "info", msg: ["hello", 1, { a: true }] },
            { level: "error", msg: ["bad news"] },
        ]);
    });

    it("records debug messages with context and level", () => {
        const recorded = recordingObservability();

        recorded.observability.debug("load", "debug", "loading file", "a.txt");
        recorded.observability.debug("findContainingDirectory", "info", "checking", "/tmp/laoban.json");

        expect(recorded.debug).toEqual([
            { context: "load", level: "debug", msg: ["loading file", "a.txt"] },
            {
                context: "findContainingDirectory",
                level: "info",
                msg: ["checking", "/tmp/laoban.json"],
            },
        ]);
    });

    it("records count metrics", () => {
        const recorded = recordingObservability();

        recorded.observability.countMetric("fileops.load.file.success");
        recorded.observability.countMetric("fileops.load.file.success");
        recorded.observability.countMetric("fileops.load.url.failure");

        expect(recorded.counts).toEqual([
            "fileops.load.file.success",
            "fileops.load.file.success",
            "fileops.load.url.failure",
        ]);
    });

    it("records duration metrics", () => {
        const recorded = recordingObservability();

        recorded.observability.durationMetric("fileops.load.file.ms", 12);
        recorded.observability.durationMetric("fileops.load.url.ms", 7);

        expect(recorded.durations).toEqual([
            { name: "fileops.load.file.ms", durationMs: 12 },
            { name: "fileops.load.url.ms", durationMs: 7 },
        ]);
    });

    it("preserves the supplied correlation id", () => {
        const recorded = recordingObservability(
            {},
            "corr-123",
        );

        expect(recorded.observability.correlationId).toBe("corr-123");
    });

    it("preserves the supplied debug levels", () => {
        const recorded = recordingObservability({
            load: ["debug"],
            findContainingDirectory: ["info", "debug"],
        });

        expect(recorded.observability.debugLevels).toEqual({
            load: ["debug"],
            findContainingDirectory: ["info", "debug"],
        });
    });

    it("preserves the supplied time service", () => {
        const timeService = steppingTimeService(100, 5);
        const recorded = recordingObservability(
            {},
            "corr-123",
            timeService,
        );

        expect(recorded.observability.timeService).toBe(timeService);
    });

    it("uses the supplied time service for deterministic time", () => {
        const recorded = recordingObservability(
            {},
            "corr-123",
            steppingTimeService(100, 5),
        );

        expect(recorded.observability.timeService.now()).toBe(100);
        expect(recorded.observability.timeService.now()).toBe(105);
        expect(recorded.observability.timeService.now()).toBe(110);
    });

    it("uses one shared recording surface for all observability methods", () => {
        const recorded = recordingObservability();

        recorded.observability.logger("warn", "warning");
        recorded.observability.debug("load", "debug", "loading");
        recorded.observability.countMetric("metric.one");
        recorded.observability.durationMetric("metric.ms", 5);

        expect(recorded.logs).toEqual([
            { level: "warn", msg: ["warning"] },
        ]);
        expect(recorded.debug).toEqual([
            { context: "load", level: "debug", msg: ["loading"] },
        ]);
        expect(recorded.counts).toEqual(["metric.one"]);
        expect(recorded.durations).toEqual([
            { name: "metric.ms", durationMs: 5 },
        ]);
    });
});