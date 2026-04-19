import { recordingObservability, steppingTimeService } from "@laoban/observability";

import {
    nodeDirname,
    nodeFileExists,
    nodeJoinPath,
    nodeLoadFile,
    nodeLoadUrl,
    nodeResolvePath,
} from "./fileops.node.defaults";

describe("file.node.defaults", () => {
    describe("nodeLoadFile", () => {
        it("loads an existing file and records success observability", async () => {
            const recorded = recordingObservability<"load" | "findContainingDirectory">(
                {},
                "test-correlation-id",
                steppingTimeService(1000, 5),
            );

            const result = await nodeLoadFile(__filename, {
                observability: recorded.observability,
            });

            expect("value" in result).toBe(true);
            if ("value" in result) {
                expect(result.value).toContain('describe("file.node.defaults"');
            }

            expect(recorded.counts).toEqual(["fileops.load.file.success"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.file.ms", durationMs: 5 },
            ]);
            expect(recorded.debug).toEqual([]);
            expect(recorded.logs).toEqual([]);
        });

        it("returns notFound for a missing file and records failure observability", async () => {
            const recorded = recordingObservability<"load" | "findContainingDirectory">(
                {},
                "test-correlation-id",
                steppingTimeService(1000, 5),
            );
            const missing = `${__filename}.missing`;

            const result = await nodeLoadFile(missing, {
                observability: recorded.observability,
            });

            expect("errors" in result).toBe(true);
            if ("errors" in result) {
                expect(result.errors).toEqual([
                    {
                        kind: "notFound",
                        message: `Failed to read file [${missing}]`,
                        severity: "error",
                        context: {
                            operation: "load",
                            filename: missing,
                            cause: expect.anything(),
                        },
                        code: "ENOENT",
                    },
                ]);
            }

            expect(recorded.counts).toEqual(["fileops.load.file.failure"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.file.ms", durationMs: 5 },
            ]);
            expect(recorded.debug).toEqual([]);
            expect(recorded.logs).toEqual([]);
        });
    });

    describe("nodeLoadUrl", () => {
        const originalFetch = global.fetch;

        afterEach(() => {
            global.fetch = originalFetch;
            jest.restoreAllMocks();
        });

        it("loads a url and records success observability", async () => {
            const recorded = recordingObservability<"load" | "findContainingDirectory">(
                {},
                "test-correlation-id",
                steppingTimeService(2000, 7),
            );

            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                text: async () => "url text",
            } as Response);

            const result = await nodeLoadUrl("https://example.com/a.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual({ value: "url text" });
            expect(recorded.counts).toEqual(["fileops.load.url.success"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.url.ms", durationMs: 7 },
            ]);
            expect(recorded.debug).toEqual([]);
            expect(recorded.logs).toEqual([]);
        });

        it("returns notReadable when the response is not ok and records failure observability", async () => {
            const recorded = recordingObservability<"load" | "findContainingDirectory">(
                {},
                "test-correlation-id",
                steppingTimeService(2000, 7),
            );

            global.fetch = jest.fn().mockResolvedValue({
                ok: false,
                status: 404,
                text: async () => "",
            } as Response);

            const result = await nodeLoadUrl("https://example.com/missing.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual({
                errors: [
                    {
                        kind: "notReadable",
                        message: "Failed to load URL [https://example.com/missing.txt]. Status 404",
                        severity: "error",
                        context: {
                            operation: "load",
                            filename: "https://example.com/missing.txt",
                        },
                    },
                ],
            });
            expect(recorded.counts).toEqual(["fileops.load.url.failure"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.url.ms", durationMs: 7 },
            ]);
            expect(recorded.debug).toEqual([]);
            expect(recorded.logs).toEqual([]);
        });

        it("returns invalidUrl when fetch throws and records failure observability", async () => {
            const recorded = recordingObservability<"load" | "findContainingDirectory">(
                {},
                "test-correlation-id",
                steppingTimeService(2000, 7),
            );

            global.fetch = jest.fn().mockRejectedValue(new Error("boom"));

            const result = await nodeLoadUrl("https://bad.example.com", {
                observability: recorded.observability,
            });

            expect(result).toEqual({
                errors: [
                    {
                        kind: "invalidUrl",
                        message: "Failed to load URL [https://bad.example.com]",
                        severity: "error",
                        context: {
                            operation: "load",
                            filename: "https://bad.example.com",
                            cause: expect.any(Error),
                        },
                    },
                ],
            });
            expect(recorded.counts).toEqual(["fileops.load.url.failure"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.url.ms", durationMs: 7 },
            ]);
            expect(recorded.debug).toEqual([]);
            expect(recorded.logs).toEqual([]);
        });
    });

    describe("nodeFileExists", () => {
        it("returns true for an existing file and records success observability", async () => {
            const recorded = recordingObservability<"load" | "findContainingDirectory">(
                {},
                "test-correlation-id",
                steppingTimeService(3000, 3),
            );

            const result = await nodeFileExists(__filename, {
                observability: recorded.observability,
            });

            expect(result).toEqual({ value: true });
            expect(recorded.counts).toEqual([
                "fileops.findContainingDirectory.fileExists.success",
            ]);
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.findContainingDirectory.fileExists.ms",
                    durationMs: 3,
                },
            ]);
            expect(recorded.debug).toEqual([]);
            expect(recorded.logs).toEqual([]);
        });

        it("returns false for a missing file and records notFound observability", async () => {
            const recorded = recordingObservability<"load" | "findContainingDirectory">(
                {},
                "test-correlation-id",
                steppingTimeService(3000, 3),
            );
            const missing = `${__filename}.missing`;

            const result = await nodeFileExists(missing, {
                observability: recorded.observability,
            });

            expect(result).toEqual({ value: false });
            expect(recorded.counts).toEqual([
                "fileops.findContainingDirectory.fileExists.notFound",
            ]);
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.findContainingDirectory.fileExists.ms",
                    durationMs: 3,
                },
            ]);
            expect(recorded.debug).toEqual([]);
            expect(recorded.logs).toEqual([]);
        });
    });

    describe("path helpers", () => {
        it("nodeDirname returns the parent directory", () => {
            expect(nodeDirname("/a/b/c")).toBe("/a/b");
        });

        it("nodeResolvePath resolves a path", () => {
            expect(nodeResolvePath(".")).toEqual(expect.any(String));
        });

        it("nodeJoinPath joins a directory and filename", () => {
            const joined = nodeJoinPath("/a/b", "c.txt");
            expect(joined.endsWith("a/b/c.txt") || joined.endsWith("a\\b\\c.txt")).toBe(true);
        });
    });
});