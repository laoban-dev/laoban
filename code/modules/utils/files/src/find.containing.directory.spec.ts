import { errors, value } from "@laoban/errors";
import {
    recordingObservability,
    steppingTimeService,
} from "@laoban/observability";

import {
    FindContainingDirectoryConfig,
    FindContainingDirectoryDefaults,
} from "./fileops";
import { findContainingDirectory } from "./find.containing.directory";

describe("findContainingDirectory", () => {
    const fileExists = jest.fn();
    const dirname = jest.fn((dir: string) => {
        const parts = dir.split("/");
        return parts.length <= 1 ? dir : parts.slice(0, -1).join("/") || "/";
    });
    const resolvePath = jest.fn((p: string) => p);
    const joinPath = jest.fn((dir: string, file: string) =>
        dir === "/" ? `/${file}` : `${dir}/${file}`,
    );

    let recorded: ReturnType<typeof recordingObservability>;
    let defaults: FindContainingDirectoryDefaults;
    let config: FindContainingDirectoryConfig;
    let finder: ReturnType<typeof findContainingDirectory>;

    beforeEach(() => {
        jest.clearAllMocks();
        recorded = recordingObservability(
            {},
            "test-correlation-id",
            steppingTimeService(1000, 5),
        );

        defaults = {
            infrastructure: {
                fileExists,
                pathOps: {
                    dirname,
                    resolvePath,
                    joinPath,
                },
            },
        };

        config = {
            observability: recorded.observability,
        };

        finder = findContainingDirectory(defaults);
    });

    it("returns the starting directory when the marker file exists there", async () => {
        fileExists.mockResolvedValue(value(true));

        const result = await finder(
            "/workspace/project",
            "laoban.json",
            config,
        );

        expect(fileExists).toHaveBeenCalledWith(
            "/workspace/project/laoban.json",
            expect.any(Object),
        );
        expect(result).toEqual(value("/workspace/project"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("walks up directories until it finds the marker file", async () => {
        fileExists
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(true));

        const result = await finder(
            "/workspace/project/packages/a",
            "laoban.json",
            config,
        );

        expect(fileExists).toHaveBeenNthCalledWith(
            1,
            "/workspace/project/packages/a/laoban.json",
            expect.any(Object),
        );
        expect(fileExists).toHaveBeenNthCalledWith(
            2,
            "/workspace/project/packages/laoban.json",
            expect.any(Object),
        );
        expect(fileExists).toHaveBeenNthCalledWith(
            3,
            "/workspace/project/laoban.json",
            expect.any(Object),
        );
        expect(result).toEqual(value("/workspace/project"));
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("returns notFound when it reaches the root without finding the marker", async () => {
        fileExists.mockResolvedValue(value(false));

        const result = await finder(
            "/workspace/project",
            "laoban.json",
            config,
        );

        expect(result).toEqual({
            errors: [
                {
                    kind: "notFound",
                    message:
                        "Could not find containing directory for marker file [laoban.json] starting at [/workspace/project]",
                    severity: "error",
                    context: {
                        operation: "findContainingDirectory",
                        start: "/workspace/project",
                        markerFileName: "laoban.json",
                    },
                },
            ],
        });
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("passes through errors from fileExists", async () => {
        const existsError = errors({
            kind: "unexpected",
            message: "permission denied",
            severity: "error",
            context: {
                operation: "findContainingDirectory",
            },
        });
        fileExists.mockResolvedValue(existsError);

        const result = await finder(
            "/workspace/project",
            "laoban.json",
            config,
        );

        expect(result).toEqual(existsError);
        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("uses defaults path functions when config does not provide infrastructure", async () => {
        fileExists
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(true));

        const result = await finder(
            "/workspace/project/packages/a",
            "laoban.json",
            {
                observability: recorded.observability,
            },
        );

        expect(resolvePath).toHaveBeenCalledWith("/workspace/project/packages/a");
        expect(fileExists).toHaveBeenNthCalledWith(
            1,
            "/workspace/project/packages/a/laoban.json",
            expect.any(Object),
        );
        expect(fileExists).toHaveBeenNthCalledWith(
            2,
            "/workspace/project/packages/laoban.json",
            expect.any(Object),
        );
        expect(fileExists).toHaveBeenNthCalledWith(
            3,
            "/workspace/project/laoban.json",
            expect.any(Object),
        );
        expect(result).toEqual(value("/workspace/project"));
    });

    it("allows config infrastructure to override defaults", async () => {
        const customDirname = jest.fn((dir: string) =>
            dir === "c" ? "b" : dir === "b" ? "a" : dir,
        );
        const customResolvePath = jest.fn(() => "c");
        const customJoinPath = jest.fn((dir: string, file: string) => `${dir}/${file}`);

        fileExists
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(true));

        const result = await finder("ignored", "marker.txt", {
            observability: recorded.observability,
            infrastructure: {
                fileExists,
                pathOps: {
                    dirname: customDirname,
                    resolvePath: customResolvePath,
                    joinPath: customJoinPath,
                },
            },
        });

        expect(customResolvePath).toHaveBeenCalledWith("ignored");
        expect(fileExists).toHaveBeenNthCalledWith(1, "c/marker.txt", expect.any(Object));
        expect(fileExists).toHaveBeenNthCalledWith(2, "b/marker.txt", expect.any(Object));
        expect(fileExists).toHaveBeenNthCalledWith(3, "a/marker.txt", expect.any(Object));
        expect(result).toEqual(value("a"));
        expect(dirname).not.toHaveBeenCalled();
        expect(resolvePath).not.toHaveBeenCalled();
        expect(joinPath).not.toHaveBeenCalled();
    });

    it("records only what fileExists records", async () => {
        fileExists
            .mockImplementationOnce(async (_filename, cfg) => {
                cfg?.observability?.countMetric("fileops.findContainingDirectory.fileExists.notFound");
                cfg?.observability?.durationMetric("fileops.findContainingDirectory.fileExists.ms", 2);
                return value(false);
            })
            .mockImplementationOnce(async (_filename, cfg) => {
                cfg?.observability?.countMetric("fileops.findContainingDirectory.fileExists.success");
                cfg?.observability?.durationMetric("fileops.findContainingDirectory.fileExists.ms", 3);
                return value(true);
            });

        const result = await finder(
            "/workspace/project/packages",
            "laoban.json",
            config,
        );

        expect(result).toEqual(value("/workspace/project"));
        expect(recorded.counts).toEqual([
            "fileops.findContainingDirectory.fileExists.notFound",
            "fileops.findContainingDirectory.fileExists.success",
        ]);
        expect(recorded.durations).toEqual([
            { name: "fileops.findContainingDirectory.fileExists.ms", durationMs: 2 },
            { name: "fileops.findContainingDirectory.fileExists.ms", durationMs: 3 },
        ]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("records durations from the stepped time service when fileExists measures elapsed time", async () => {
        fileExists
            .mockImplementationOnce(async (_filename, cfg) => {
                const start = cfg!.observability.timeService.now();
                const end = cfg!.observability.timeService.now();
                cfg!.observability.durationMetric(
                    "fileops.findContainingDirectory.fileExists.ms",
                    end - start,
                );
                return value(false);
            })
            .mockImplementationOnce(async (_filename, cfg) => {
                const start = cfg!.observability.timeService.now();
                const end = cfg!.observability.timeService.now();
                cfg!.observability.durationMetric(
                    "fileops.findContainingDirectory.fileExists.ms",
                    end - start,
                );
                return value(true);
            });

        const result = await finder(
            "/workspace/project/packages",
            "laoban.json",
            config,
        );

        expect(result).toEqual(value("/workspace/project"));
        expect(recorded.durations).toEqual([
            { name: "fileops.findContainingDirectory.fileExists.ms", durationMs: 5 },
            { name: "fileops.findContainingDirectory.fileExists.ms", durationMs: 5 },
        ]);
    });

    it("records no observability when fileExists records nothing", async () => {
        fileExists.mockResolvedValue(value(true));

        await finder(
            "/workspace/project",
            "laoban.json",
            config,
        );

        expect(recorded.counts).toEqual([]);
        expect(recorded.durations).toEqual([]);
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });
});