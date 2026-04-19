import { value } from "@laoban/errors";
import {
    recordingObservability,
    steppingTimeService,
} from "@laoban/observability";

import { loadFromMarker, loadText } from "./load.text";
import { FileDebugContext, FileOpIssue, LoadTextConfig } from "./fileops";

const makeIssue = (message: string): FileOpIssue => ({
    kind: "unexpected",
    message,
    severity: "error",
    context: {
        operation: "load",
    },
});

describe("loadText", () => {
    const loadFile = jest.fn();
    const loadUrl = jest.fn();

    let recorded: ReturnType<typeof recordingObservability<FileDebugContext>>;
    let config: LoadTextConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        recorded = recordingObservability<FileDebugContext>(
            {},
            "test-correlation-id",
            steppingTimeService(1000, 5),
        );
        config = {
            observability: recorded.observability,
            markers: {
                "@laoban@": "/tmp/root",
                "@docs@": "https://example.com/docs",
            },
            loadFile,
            loadUrl,
        };
    });

    it("loads a plain file using loadFile", async () => {
        loadFile.mockResolvedValue(value("file text"));

        const result = await loadText("some/file.txt", config);

        expect(loadFile).toHaveBeenCalledWith("some/file.txt", expect.any(Object));
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual(value("file text"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("loads an http url using loadUrl", async () => {
        loadUrl.mockResolvedValue(value("url text"));

        const result = await loadText("http://example.com/a.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("http://example.com/a.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("url text"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("loads an https url using loadUrl", async () => {
        loadUrl.mockResolvedValue(value("secure url text"));

        const result = await loadText("https://example.com/a.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("https://example.com/a.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("secure url text"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("resolves a marker to a file and then loads it", async () => {
        loadFile.mockResolvedValue(value("marker file text"));

        const result = await loadText("@laoban@/templates/a.txt", config);

        expect(loadFile).toHaveBeenCalledWith("/tmp/root/templates/a.txt", expect.any(Object));
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual(value("marker file text"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("resolves a marker to a url and then loads it", async () => {
        loadUrl.mockResolvedValue(value("marker url text"));

        const result = await loadText("@docs@/guide.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("https://example.com/docs/guide.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("marker url text"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("returns an unknownMarker error when the marker is not configured", async () => {
        const result = await loadText("@missing@/guide.txt", config);

        expect(loadFile).not.toHaveBeenCalled();
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual({
            errors: [
                {
                    kind: "unknownMarker",
                    message: "Unknown marker in source [@missing@/guide.txt]",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "@missing@/guide.txt",
                    },
                },
            ],
        });
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("uses defaults when config is omitted", async () => {
        const result = await loadText("plain.txt");

        expect("errors" in result).toBe(true);
    });

    it("passes through errors from loadFile", async () => {
        const fileError = {
            errors: [makeIssue("file failed")],
        };
        loadFile.mockResolvedValue(fileError);

        const result = await loadText("some/file.txt", config);

        expect(result).toEqual(fileError);
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("passes through errors from loadUrl", async () => {
        const urlError = {
            errors: [makeIssue("url failed")],
        };
        loadUrl.mockResolvedValue(urlError);

        const result = await loadText("https://example.com/f.txt", config);

        expect(result).toEqual(urlError);
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("records only the effect-level observability that a loader emits", async () => {
        loadFile.mockImplementation(async (_filename, cfg) => {
            cfg?.observability?.countMetric("fileops.load.file.success");
            cfg?.observability?.durationMetric("fileops.load.file.ms", 12);
            return value("file text");
        });

        const result = await loadText("@laoban@/templates/a.txt", config);

        expect(result).toEqual(value("file text"));
        expect(recorded.counts).toEqual(["fileops.load.file.success"]);
        expect(recorded.durations).toEqual([
            { name: "fileops.load.file.ms", durationMs: 12 },
        ]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("records only the effect-level observability that a url loader emits", async () => {
        loadUrl.mockImplementation(async (_url, cfg) => {
            cfg?.observability?.countMetric("fileops.load.url.success");
            cfg?.observability?.durationMetric("fileops.load.url.ms", 7);
            return value("url text");
        });

        const result = await loadText("https://example.com/a.txt", config);

        expect(result).toEqual(value("url text"));
        expect(recorded.counts).toEqual(["fileops.load.url.success"]);
        expect(recorded.durations).toEqual([
            { name: "fileops.load.url.ms", durationMs: 7 },
        ]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("passes the stepped time service through to file loaders", async () => {
        loadFile.mockImplementation(async (_filename, cfg) => {
            const start = cfg!.observability.timeService.now();
            const end = cfg!.observability.timeService.now();
            cfg!.observability.durationMetric("fileops.load.file.ms", end - start);
            return value("file text");
        });

        const result = await loadText("@laoban@/templates/a.txt", config);

        expect(result).toEqual(value("file text"));
        expect(recorded.durations).toEqual([
            { name: "fileops.load.file.ms", durationMs: 5 },
        ]);
    });

    it("passes the stepped time service through to url loaders", async () => {
        loadUrl.mockImplementation(async (_url, cfg) => {
            const start = cfg!.observability.timeService.now();
            const end = cfg!.observability.timeService.now();
            cfg!.observability.durationMetric("fileops.load.url.ms", end - start);
            return value("url text");
        });

        const result = await loadText("https://example.com/a.txt", config);

        expect(result).toEqual(value("url text"));
        expect(recorded.durations).toEqual([
            { name: "fileops.load.url.ms", durationMs: 5 },
        ]);
    });
});

describe("loadFromMarker", () => {
    const loadFile = jest.fn();
    const loadUrl = jest.fn();

    let recorded: ReturnType<typeof recordingObservability<FileDebugContext>>;
    let config: LoadTextConfig;

    beforeEach(() => {
        jest.clearAllMocks();
        recorded = recordingObservability<FileDebugContext>(
            {},
            "test-correlation-id",
            steppingTimeService(2000, 3),
        );
        config = {
            observability: recorded.observability,
            markers: {
                "@root@": "/workspace/root",
            },
            loadFile,
            loadUrl,
        };
    });

    it("recursively delegates to loadText after marker replacement", async () => {
        loadFile.mockResolvedValue(value("from marker"));

        const result = await loadFromMarker("@root@/x.txt", config);

        expect(loadFile).toHaveBeenCalledWith("/workspace/root/x.txt", expect.any(Object));
        expect(result).toEqual(value("from marker"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("returns unknownMarker when no configured marker matches", async () => {
        const result = await loadFromMarker("@other@/x.txt", config);

        expect(result).toEqual({
            errors: [
                {
                    kind: "unknownMarker",
                    message: "Unknown marker in source [@other@/x.txt]",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "@other@/x.txt",
                    },
                },
            ],
        });
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("records only what the delegated loader records", async () => {
        loadFile.mockImplementation(async (_filename, cfg) => {
            cfg?.observability?.countMetric("fileops.load.file.success");
            cfg?.observability?.durationMetric("fileops.load.file.ms", 3);
            return value("from marker");
        });

        const result = await loadFromMarker("@root@/x.txt", config);

        expect(result).toEqual(value("from marker"));
        expect(recorded.counts).toEqual(["fileops.load.file.success"]);
        expect(recorded.durations).toEqual([
            { name: "fileops.load.file.ms", durationMs: 3 },
        ]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("passes the stepped time service through to delegated loaders", async () => {
        loadFile.mockImplementation(async (_filename, cfg) => {
            const start = cfg!.observability.timeService.now();
            const end = cfg!.observability.timeService.now();
            cfg!.observability.durationMetric("fileops.load.file.ms", end - start);
            return value("from marker");
        });

        const result = await loadFromMarker("@root@/x.txt", config);

        expect(result).toEqual(value("from marker"));
        expect(recorded.durations).toEqual([
            { name: "fileops.load.file.ms", durationMs: 3 },
        ]);
    });
});