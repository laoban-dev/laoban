import { errors, value } from "@laoban/errors";
import {
    recordingObservability,
    steppingTimeService,
} from "@laoban/observability";

import {
    FileDebugContext,
    FileOpIssue,
    LoadTextConfig,
    LoadTextDefaults,
} from "./fileops";
import { loadFromMarker, loadText } from "./load.text";

describe("loadText", () => {
    const loadFile = jest.fn();
    const loadUrl = jest.fn();

    let recorded: ReturnType<typeof recordingObservability<FileDebugContext>>;
    let defaults: LoadTextDefaults;
    let config: LoadTextConfig;
    let loader: ReturnType<typeof loadText>;
    let markerLoader: ReturnType<typeof loadFromMarker>;

    beforeEach(() => {
        jest.clearAllMocks();
        recorded = recordingObservability<FileDebugContext>(
            {},
            "test-correlation-id",
            steppingTimeService(1000, 5),
        );

        defaults = {
            infrastructure: {
                loadFile,
                loadUrl,
            },
        };

        config = {
            observability: recorded.observability,
            markers: {
                "@root/": "/workspace/",
                "@config/": "/workspace/config/",
            },
        };

        loader = loadText(defaults);
        markerLoader = loadFromMarker(defaults);
    });

    it("loads a file when the source is not a url or marker", async () => {
        loadFile.mockResolvedValue(value("file contents"));

        const result = await loader("some/file.txt", config);

        expect(loadFile).toHaveBeenCalledWith("some/file.txt", expect.any(Object));
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual(value("file contents"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("loads a url when the source starts with http", async () => {
        loadUrl.mockResolvedValue(value("url contents"));

        const result = await loader("http://example.com/file.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("http://example.com/file.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("url contents"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("loads a url when the source starts with https", async () => {
        loadUrl.mockResolvedValue(value("secure url contents"));

        const result = await loader("https://example.com/file.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("https://example.com/file.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("secure url contents"));
    });

    it("resolves a marker and then loads the resulting file", async () => {
        loadFile.mockResolvedValue(value("resolved contents"));

        const result = await loader("@root/package.json", config);

        expect(loadFile).toHaveBeenCalledWith("/workspace/package.json", expect.any(Object));
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual(value("resolved contents"));
    });

    it("resolves a more specific marker when present", async () => {
        loadFile.mockResolvedValue(value("config contents"));

        const result = await loader("@config/app.json", config);

        expect(loadFile).toHaveBeenCalledWith("/workspace/config/app.json", expect.any(Object));
        expect(result).toEqual(value("config contents"));
    });

    it("returns unknownMarker when the source starts with @ but no marker matches", async () => {
        const result = await loader("@missing/file.txt", config);

        expect(result).toEqual({
            errors: [
                {
                    kind: "unknownMarker",
                    message: "Unknown marker in source [@missing/file.txt]",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "@missing/file.txt",
                    },
                },
            ],
        });
        expect(loadFile).not.toHaveBeenCalled();
        expect(loadUrl).not.toHaveBeenCalled();
    });

    it("passes through errors from loadFile", async () => {
        const fileError = errors({
            kind: "notFound",
            message: "missing file",
            severity: "error",
            context: {
                operation: "load",
                filename: "some/file.txt",
            },
        });
        loadFile.mockResolvedValue(fileError);

        const result = await loader("some/file.txt", config);

        expect(result).toEqual(fileError);
        expect(loadFile).toHaveBeenCalledWith("some/file.txt", expect.any(Object));
        expect(loadUrl).not.toHaveBeenCalled();
    });

    it("passes through errors from loadUrl", async () => {
        const urlError = errors({
            kind: "invalidUrl",
            message: "bad url",
            severity: "error",
            context: {
                operation: "load",
                filename: "https://example.com/file.txt",
            },
        });
        loadUrl.mockResolvedValue(urlError);

        const result = await loader("https://example.com/file.txt", config);

        expect(result).toEqual(urlError);
        expect(loadUrl).toHaveBeenCalledWith("https://example.com/file.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
    });

    it("passes the resolved config to loadFile", async () => {
        loadFile.mockResolvedValue(value("ok"));

        await loader("plain.txt", config);

        const passedConfig = loadFile.mock.calls[0][1] as LoadTextConfig;
        expect(passedConfig.observability).toBe(recorded.observability);
        expect(passedConfig.markers).toEqual({
            "@root/": "/workspace/",
            "@config/": "/workspace/config/",
        });
        expect(passedConfig.infrastructure).toEqual({
            loadFile,
            loadUrl,
        });
    });

    it("passes the resolved config to loadUrl", async () => {
        loadUrl.mockResolvedValue(value("ok"));

        await loader("https://example.com/file.txt", config);

        const passedConfig = loadUrl.mock.calls[0][1] as LoadTextConfig;
        expect(passedConfig.observability).toBe(recorded.observability);
        expect(passedConfig.markers).toEqual({
            "@root/": "/workspace/",
            "@config/": "/workspace/config/",
        });
        expect(passedConfig.infrastructure).toEqual({
            loadFile,
            loadUrl,
        });
    });

    it("supports calling loadFromMarker directly", async () => {
        loadFile.mockResolvedValue(value("marker contents"));

        const result = await markerLoader("@root/readme.md", config);

        expect(loadFile).toHaveBeenCalledWith("/workspace/readme.md", expect.any(Object));
        expect(result).toEqual(value("marker contents"));
    });

    it("returns unknownMarker from loadFromMarker directly when no marker matches", async () => {
        const result = await markerLoader("@other/readme.md", config);

        expect(result).toEqual({
            errors: [
                {
                    kind: "unknownMarker",
                    message: "Unknown marker in source [@other/readme.md]",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "@other/readme.md",
                    },
                },
            ],
        });
    });

    it("uses defaults infrastructure when config does not provide infrastructure", async () => {
        loadFile.mockResolvedValue(value("from defaults"));

        const result = await loader("plain.txt", {
            observability: recorded.observability,
            markers: {
                "@root/": "/workspace/",
            },
        });

        expect(result).toEqual(value("from defaults"));
        expect(loadFile).toHaveBeenCalledWith("plain.txt", expect.any(Object));
    });

    it("allows config infrastructure to override defaults", async () => {
        const overrideLoadFile = jest.fn().mockResolvedValue(value("from override"));

        const result = await loader("plain.txt", {
            observability: recorded.observability,
            infrastructure: {
                loadFile: overrideLoadFile,
                loadUrl,
            },
        });

        expect(result).toEqual(value("from override"));
        expect(overrideLoadFile).toHaveBeenCalledWith("plain.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
    });

    it("records only what infrastructure records", async () => {
        loadFile.mockImplementationOnce(async (_source, cfg) => {
            cfg?.observability?.countMetric("fileops.load.file.success");
            cfg?.observability?.durationMetric("fileops.load.file.ms", 7);
            return value("measured");
        });

        const result = await loader("plain.txt", config);

        expect(result).toEqual(value("measured"));
        expect(recorded.counts).toEqual(["fileops.load.file.success"]);
        expect(recorded.durations).toEqual([
            { name: "fileops.load.file.ms", durationMs: 7 },
        ]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("records durations from the stepped time service when infrastructure measures elapsed time", async () => {
        loadUrl.mockImplementationOnce(async (_source, cfg) => {
            const start = cfg!.observability.timeService.now();
            const end = cfg!.observability.timeService.now();
            cfg!.observability.durationMetric("fileops.load.url.ms", end - start);
            return value("timed");
        });

        const result = await loader("https://example.com/a.txt", config);

        expect(result).toEqual(value("timed"));
        expect(recorded.durations).toEqual([
            { name: "fileops.load.url.ms", durationMs: 5 },
        ]);
    });

    it("records no observability when infrastructure records nothing", async () => {
        loadFile.mockResolvedValue(value("quiet"));

        await loader("plain.txt", config);

        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });
});