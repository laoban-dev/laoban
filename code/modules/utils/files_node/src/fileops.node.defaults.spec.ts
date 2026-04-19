import * as path from "path";
import { access, readFile } from "fs/promises";

import { errors, value } from "@laoban/errors";
import {
    recordingObservability,
    steppingTimeService,
} from "@laoban/observability";

import { nodeFileOpsDefaults } from "./fileops.node.defaults";
import {FileDebugContext} from "@laoban/files";

jest.mock("fs/promises", () => ({
    access: jest.fn(),
    readFile: jest.fn(),
}));

describe("nodeFileOpsDefaults", () => {
    let recorded: ReturnType<typeof recordingObservability<FileDebugContext>>;

    beforeEach(() => {
        jest.clearAllMocks();
        recorded = recordingObservability<FileDebugContext>(
            {},
            "test-correlation-id",
            steppingTimeService(1000, 5),
        );
    });

    describe("findContainingDirectory.infrastructure.pathOps", () => {
        const { pathOps } = nodeFileOpsDefaults.findContainingDirectory.infrastructure;

        it("dirname delegates to node path.dirname", () => {
            expect(pathOps.dirname("/a/b/c")).toEqual(path.dirname("/a/b/c"));
        });

        it("resolvePath delegates to node path.resolve", () => {
            expect(pathOps.resolvePath("./a/b")).toEqual(path.resolve("./a/b"));
        });

        it("joinPath delegates to node path.join", () => {
            expect(pathOps.joinPath("/a/b", "file.txt")).toEqual(path.join("/a/b", "file.txt"));
        });
    });

    describe("findContainingDirectory.infrastructure.fileExists", () => {
        const fileExists = nodeFileOpsDefaults.findContainingDirectory.infrastructure.fileExists;

        it("returns true when access succeeds", async () => {
            (access as jest.Mock).mockResolvedValue(undefined);

            const result = await fileExists("/tmp/file.txt", {
                observability: recorded.observability,
            });

            expect(access).toHaveBeenCalledWith("/tmp/file.txt");
            expect(result).toEqual(value(true));
            expect(recorded.counts).toEqual([
                "fileops.findContainingDirectory.fileExists.success",
            ]);
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.findContainingDirectory.fileExists.ms",
                    durationMs: 5,
                },
            ]);
        });

        it("returns false when access throws ENOENT", async () => {
            const cause = Object.assign(new Error("missing"), { code: "ENOENT" });
            (access as jest.Mock).mockRejectedValue(cause);

            const result = await fileExists("/tmp/missing.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(value(false));
            expect(recorded.counts).toEqual([
                "fileops.findContainingDirectory.fileExists.notFound",
            ]);
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.findContainingDirectory.fileExists.ms",
                    durationMs: 5,
                },
            ]);
        });

        it("returns notReadable when access throws EACCES", async () => {
            const cause = Object.assign(new Error("denied"), { code: "EACCES" });
            (access as jest.Mock).mockRejectedValue(cause);

            const result = await fileExists("/tmp/secret.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed checking existence of [/tmp/secret.txt]",
                    severity: "error",
                    code: "EACCES",
                    context: {
                        operation: "findContainingDirectory",
                        filename: "/tmp/secret.txt",
                        cause,
                    },
                }),
            );
            expect(recorded.counts).toEqual([
                "fileops.findContainingDirectory.fileExists.failure",
            ]);
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.findContainingDirectory.fileExists.ms",
                    durationMs: 5,
                },
            ]);
        });

        it("returns io when access throws unknown code", async () => {
            const cause = Object.assign(new Error("boom"), { code: "EIO" });
            (access as jest.Mock).mockRejectedValue(cause);

            const result = await fileExists("/tmp/file.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(
                errors({
                    kind: "io",
                    message: "Failed checking existence of [/tmp/file.txt]",
                    severity: "error",
                    code: "EIO",
                    context: {
                        operation: "findContainingDirectory",
                        filename: "/tmp/file.txt",
                        cause,
                    },
                }),
            );
        });

        it("works without observability", async () => {
            (access as jest.Mock).mockResolvedValue(undefined);

            const result = await fileExists("/tmp/file.txt");

            expect(result).toEqual(value(true));
        });
    });

    describe("loadText.infrastructure.loadFile", () => {
        const loadFile = nodeFileOpsDefaults.loadText.infrastructure.loadFile;

        it("returns text when readFile succeeds", async () => {
            (readFile as jest.Mock).mockResolvedValue("hello world");

            const result = await loadFile("/tmp/file.txt", {
                observability: recorded.observability,
            });

            expect(readFile).toHaveBeenCalledWith("/tmp/file.txt", "utf8");
            expect(result).toEqual(value("hello world"));
            expect(recorded.counts).toEqual(["fileops.load.file.success"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.file.ms", durationMs: 5 },
            ]);
        });

        it("returns notFound when readFile throws ENOENT", async () => {
            const cause = Object.assign(new Error("missing"), { code: "ENOENT" });
            (readFile as jest.Mock).mockRejectedValue(cause);

            const result = await loadFile("/tmp/missing.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(
                errors({
                    kind: "notFound",
                    message: "Failed to read file [/tmp/missing.txt]",
                    severity: "error",
                    code: "ENOENT",
                    context: {
                        operation: "load",
                        filename: "/tmp/missing.txt",
                        cause,
                    },
                }),
            );
            expect(recorded.counts).toEqual(["fileops.load.file.failure"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.file.ms", durationMs: 5 },
            ]);
        });

        it("returns notReadable when readFile throws EPERM", async () => {
            const cause = Object.assign(new Error("denied"), { code: "EPERM" });
            (readFile as jest.Mock).mockRejectedValue(cause);

            const result = await loadFile("/tmp/secret.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed to read file [/tmp/secret.txt]",
                    severity: "error",
                    code: "EPERM",
                    context: {
                        operation: "load",
                        filename: "/tmp/secret.txt",
                        cause,
                    },
                }),
            );
        });

        it("returns io when readFile throws unknown code", async () => {
            const cause = Object.assign(new Error("disk"), { code: "EIO" });
            (readFile as jest.Mock).mockRejectedValue(cause);

            const result = await loadFile("/tmp/file.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(
                errors({
                    kind: "io",
                    message: "Failed to read file [/tmp/file.txt]",
                    severity: "error",
                    code: "EIO",
                    context: {
                        operation: "load",
                        filename: "/tmp/file.txt",
                        cause,
                    },
                }),
            );
        });
    });

    describe("loadText.infrastructure.loadUrl", () => {
        const loadUrl = nodeFileOpsDefaults.loadText.infrastructure.loadUrl;
        const originalFetch = global.fetch;

        beforeEach(() => {
            global.fetch = jest.fn();
        });

        afterAll(() => {
            global.fetch = originalFetch;
        });

        it("returns text when fetch succeeds with ok response", async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue("downloaded text"),
            });

            const result = await loadUrl("https://example.com/a.txt", {
                observability: recorded.observability,
            });

            expect(global.fetch).toHaveBeenCalledWith("https://example.com/a.txt");
            expect(result).toEqual(value("downloaded text"));
            expect(recorded.counts).toEqual(["fileops.load.url.success"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.url.ms", durationMs: 5 },
            ]);
        });

        it("returns notReadable when fetch returns non-ok response", async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404,
                text: jest.fn(),
            });

            const result = await loadUrl("https://example.com/missing.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed to load URL [https://example.com/missing.txt]. Status 404",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "https://example.com/missing.txt",
                    },
                }),
            );
            expect(recorded.counts).toEqual(["fileops.load.url.failure"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.url.ms", durationMs: 5 },
            ]);
        });

        it("returns invalidUrl when fetch throws", async () => {
            const cause = new Error("network");
            (global.fetch as jest.Mock).mockRejectedValue(cause);

            const result = await loadUrl("https://example.com/a.txt", {
                observability: recorded.observability,
            });

            expect(result).toEqual(
                errors({
                    kind: "invalidUrl",
                    message: "Failed to load URL [https://example.com/a.txt]",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "https://example.com/a.txt",
                        cause,
                    },
                }),
            );
            expect(recorded.counts).toEqual(["fileops.load.url.failure"]);
            expect(recorded.durations).toEqual([
                { name: "fileops.load.url.ms", durationMs: 5 },
            ]);
        });

        it("works without observability", async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue("text"),
            });

            const result = await loadUrl("https://example.com/a.txt");

            expect(result).toEqual(value("text"));
        });
    });
});