import * as path from "path"
import {access, mkdir, readFile, readdir, writeFile} from "fs/promises"

import {errors, value} from "@laoban/errors"
import {recordingObservability, steppingTimeService} from "@laoban/observability"

import {nodeFileOpsDefaults} from "./fileops.node.defaults"

jest.mock("fs/promises", () => ({
    access: jest.fn(),
    mkdir: jest.fn(),
    readFile: jest.fn(),
    readdir: jest.fn(),
    writeFile: jest.fn(),
}))

describe("nodeFileOpsDefaults", () => {
    let recorded: ReturnType<typeof recordingObservability>

    beforeEach(() => {
        jest.clearAllMocks()
        recorded = recordingObservability(
            {},
            "test-correlation-id",
            steppingTimeService(1000, 5),
        )
    })

    describe("findContainingDirectory.infrastructure.pathOps", () => {
        const {pathOps} = nodeFileOpsDefaults.findContainingDirectory.infrastructure

        it("dirname delegates to node path.dirname", () => {
            expect(pathOps.dirname("/a/b/c")).toEqual(path.dirname("/a/b/c"))
        })

        it("resolvePath delegates to node path.resolve", () => {
            expect(pathOps.resolvePath("./a/b")).toEqual(path.resolve("./a/b"))
        })

        it("joinPath delegates to node path.join", () => {
            expect(pathOps.joinPath("/a/b", "file.txt")).toEqual(path.join("/a/b", "file.txt"))
        })
    })

    describe("findContainingDirectory.infrastructure.fileExists", () => {
        const fileExists = nodeFileOpsDefaults.findContainingDirectory.infrastructure.fileExists

        it("returns true when access succeeds", async () => {
            ;(access as jest.Mock).mockResolvedValue(undefined)

            const result = await fileExists("/tmp/file.txt", {
                observability: recorded.observability,
            })

            expect(access).toHaveBeenCalledWith("/tmp/file.txt")
            expect(result).toEqual(value(true))
            expect(recorded.counts).toEqual([
                "fileops.fileExists.success",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.fileExists.ms",
                    durationMs: 5,
                },
            ])
        })

        it("returns false when access throws ENOENT", async () => {
            const cause = Object.assign(new Error("missing"), {code: "ENOENT"})
            ;(access as jest.Mock).mockRejectedValue(cause)

            const result = await fileExists("/tmp/missing.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(value(false))
            expect(recorded.counts).toEqual([
                "fileops.fileExists.notFound",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.fileExists.ms",
                    durationMs: 5,
                },
            ])
        })

        it("returns notReadable when access throws EACCES", async () => {
            const cause = Object.assign(new Error("denied"), {code: "EACCES"})
            ;(access as jest.Mock).mockRejectedValue(cause)

            const result = await fileExists("/tmp/secret.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed checking existence of [/tmp/secret.txt]",
                    severity: "error",
                    code: "EACCES",
                    context: {
                        operation: "fileExists",
                        filename: "/tmp/secret.txt",
                        cause,
                    },
                }),
            )
            expect(recorded.counts).toEqual([
                "fileops.fileExists.failure",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.fileExists.ms",
                    durationMs: 5,
                },
            ])
        })

        it("returns io when access throws unknown code", async () => {
            const cause = Object.assign(new Error("boom"), {code: "EIO"})
            ;(access as jest.Mock).mockRejectedValue(cause)

            const result = await fileExists("/tmp/file.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "io",
                    message: "Failed checking existence of [/tmp/file.txt]",
                    severity: "error",
                    code: "EIO",
                    context: {
                        operation: "fileExists",
                        filename: "/tmp/file.txt",
                        cause,
                    },
                }),
            )
        })

        it("works without observability", async () => {
            ;(access as jest.Mock).mockResolvedValue(undefined)

            const result = await fileExists("/tmp/file.txt")

            expect(result).toEqual(value(true))
        })
    })

    describe("findAllByNameUnder.infrastructure", () => {
        const {fileExists, listDirectory, pathOps} =
            nodeFileOpsDefaults.findAllByNameUnder.infrastructure

        it("reuses node fileExists", async () => {
            ;(access as jest.Mock).mockResolvedValue(undefined)

            const result = await fileExists("/tmp/file.txt", {
                observability: recorded.observability,
            })

            expect(access).toHaveBeenCalledWith("/tmp/file.txt")
            expect(result).toEqual(value(true))
            expect(recorded.counts).toEqual([
                "fileops.fileExists.success",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.fileExists.ms",
                    durationMs: 5,
                },
            ])
        })

        it("lists a directory successfully", async () => {
            ;(readdir as jest.Mock).mockResolvedValue(["a.txt", "b.txt", "subdir"])

            const result = await listDirectory("/tmp", {
                observability: recorded.observability,
            })

            expect(readdir).toHaveBeenCalledWith("/tmp")
            expect(result).toEqual(value(["a.txt", "b.txt", "subdir"]))
            expect(recorded.counts).toEqual([
                "fileops.listDirectory.success",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.listDirectory.ms",
                    durationMs: 5,
                },
            ])
        })

        it("returns notFound when readdir throws ENOENT", async () => {
            const cause = Object.assign(new Error("missing"), {code: "ENOENT"})
            ;(readdir as jest.Mock).mockRejectedValue(cause)

            const result = await listDirectory("/tmp/missing", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "notFound",
                    message: "Failed listing directory [/tmp/missing]",
                    severity: "error",
                    code: "ENOENT",
                    context: {
                        operation: "listDirectory",
                        directory: "/tmp/missing",
                        cause,
                    },
                }),
            )
            expect(recorded.counts).toEqual([
                "fileops.listDirectory.failure",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.listDirectory.ms",
                    durationMs: 5,
                },
            ])
        })

        it("returns notReadable when readdir throws EACCES", async () => {
            const cause = Object.assign(new Error("denied"), {code: "EACCES"})
            ;(readdir as jest.Mock).mockRejectedValue(cause)

            const result = await listDirectory("/tmp/secret", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed listing directory [/tmp/secret]",
                    severity: "error",
                    code: "EACCES",
                    context: {
                        operation: "listDirectory",
                        directory: "/tmp/secret",
                        cause,
                    },
                }),
            )
        })

        it("returns io when readdir throws unknown code", async () => {
            const cause = Object.assign(new Error("disk"), {code: "EIO"})
            ;(readdir as jest.Mock).mockRejectedValue(cause)

            const result = await listDirectory("/tmp/bad", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "io",
                    message: "Failed listing directory [/tmp/bad]",
                    severity: "error",
                    code: "EIO",
                    context: {
                        operation: "listDirectory",
                        directory: "/tmp/bad",
                        cause,
                    },
                }),
            )
        })

        it("works without observability", async () => {
            ;(readdir as jest.Mock).mockResolvedValue(["a.txt"])

            const result = await listDirectory("/tmp")

            expect(result).toEqual(value(["a.txt"]))
        })

        it("uses the same pathOps as node path", () => {
            expect(pathOps.dirname("/a/b/c")).toEqual(path.dirname("/a/b/c"))
            expect(pathOps.resolvePath("./a/b")).toEqual(path.resolve("./a/b"))
            expect(pathOps.joinPath("/a/b", "file.txt")).toEqual(path.join("/a/b", "file.txt"))
        })
    })

    describe("writeText.infrastructure", () => {
        const writeText = nodeFileOpsDefaults.writeText.infrastructure.writeText

        it("creates parent directory and writes text", async () => {
            ;(mkdir as jest.Mock).mockResolvedValue(undefined)
            ;(writeFile as jest.Mock).mockResolvedValue(undefined)

            const result = await writeText("/tmp/generated/file.txt", "hello world", {
                observability: recorded.observability,
            })

            expect(mkdir).toHaveBeenCalledWith("/tmp/generated", {recursive: true})
            expect(writeFile).toHaveBeenCalledWith("/tmp/generated/file.txt", "hello world", "utf8")
            expect(result).toEqual(value(undefined))
            expect(recorded.counts).toEqual([
                "fileops.writeText.success",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.writeText.ms",
                    durationMs: 5,
                },
            ])
        })

        it("returns notReadable when writeFile throws EACCES", async () => {
            const cause = Object.assign(new Error("denied"), {code: "EACCES"})
            ;(mkdir as jest.Mock).mockResolvedValue(undefined)
            ;(writeFile as jest.Mock).mockRejectedValue(cause)

            const result = await writeText("/tmp/secret/file.txt", "hello", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed to write file [/tmp/secret/file.txt]",
                    severity: "error",
                    code: "EACCES",
                    context: {
                        operation: "writeText",
                        filename: "/tmp/secret/file.txt",
                        cause,
                    },
                }),
            )
            expect(recorded.counts).toEqual([
                "fileops.writeText.failure",
            ])
            expect(recorded.durations).toEqual([
                {
                    name: "fileops.writeText.ms",
                    durationMs: 5,
                },
            ])
        })

        it("returns io when mkdir throws unknown code", async () => {
            const cause = Object.assign(new Error("disk"), {code: "EIO"})
            ;(mkdir as jest.Mock).mockRejectedValue(cause)

            const result = await writeText("/tmp/bad/file.txt", "hello", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "io",
                    message: "Failed to write file [/tmp/bad/file.txt]",
                    severity: "error",
                    code: "EIO",
                    context: {
                        operation: "writeText",
                        filename: "/tmp/bad/file.txt",
                        cause,
                    },
                }),
            )
        })

        it("works without observability", async () => {
            ;(mkdir as jest.Mock).mockResolvedValue(undefined)
            ;(writeFile as jest.Mock).mockResolvedValue(undefined)

            const result = await writeText("/tmp/file.txt", "hello")

            expect(result).toEqual(value(undefined))
        })
    })

    describe("loadText.infrastructure.loadFile", () => {
        const loadFile = nodeFileOpsDefaults.loadText.infrastructure.loadFile

        it("returns text when readFile succeeds", async () => {
            ;(readFile as jest.Mock).mockResolvedValue("hello world")

            const result = await loadFile("/tmp/file.txt", {
                observability: recorded.observability,
            })

            expect(readFile).toHaveBeenCalledWith("/tmp/file.txt", "utf8")
            expect(result).toEqual(value("hello world"))
            expect(recorded.counts).toEqual(["fileops.loadText.file.success"])
            expect(recorded.durations).toEqual([
                {name: "fileops.loadText.file.ms", durationMs: 5},
            ])
        })

        it("returns notFound when readFile throws ENOENT", async () => {
            const cause = Object.assign(new Error("missing"), {code: "ENOENT"})
            ;(readFile as jest.Mock).mockRejectedValue(cause)

            const result = await loadFile("/tmp/missing.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "notFound",
                    message: "Failed to read file [/tmp/missing.txt]",
                    severity: "error",
                    code: "ENOENT",
                    context: {
                        operation: "loadText",
                        filename: "/tmp/missing.txt",
                        cause,
                    },
                }),
            )
            expect(recorded.counts).toEqual(["fileops.loadText.file.failure"])
            expect(recorded.durations).toEqual([
                {name: "fileops.loadText.file.ms", durationMs: 5},
            ])
        })

        it("returns notReadable when readFile throws EPERM", async () => {
            const cause = Object.assign(new Error("denied"), {code: "EPERM"})
            ;(readFile as jest.Mock).mockRejectedValue(cause)

            const result = await loadFile("/tmp/secret.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed to read file [/tmp/secret.txt]",
                    severity: "error",
                    code: "EPERM",
                    context: {
                        operation: "loadText",
                        filename: "/tmp/secret.txt",
                        cause,
                    },
                }),
            )
        })

        it("returns io when readFile throws unknown code", async () => {
            const cause = Object.assign(new Error("disk"), {code: "EIO"})
            ;(readFile as jest.Mock).mockRejectedValue(cause)

            const result = await loadFile("/tmp/file.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "io",
                    message: "Failed to read file [/tmp/file.txt]",
                    severity: "error",
                    code: "EIO",
                    context: {
                        operation: "loadText",
                        filename: "/tmp/file.txt",
                        cause,
                    },
                }),
            )
        })
    })

    describe("loadText.infrastructure.loadUrl", () => {
        const loadUrl = nodeFileOpsDefaults.loadText.infrastructure.loadUrl
        const originalFetch = global.fetch

        beforeEach(() => {
            global.fetch = jest.fn()
        })

        afterAll(() => {
            global.fetch = originalFetch
        })

        it("returns text when fetch succeeds with ok response", async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue("downloaded text"),
            })

            const result = await loadUrl("https://example.com/a.txt", {
                observability: recorded.observability,
            })

            expect(global.fetch).toHaveBeenCalledWith("https://example.com/a.txt")
            expect(result).toEqual(value("downloaded text"))
            expect(recorded.counts).toEqual(["fileops.loadText.url.success"])
            expect(recorded.durations).toEqual([
                {name: "fileops.loadText.url.ms", durationMs: 5},
            ])
        })

        it("returns notReadable when fetch returns non-ok response", async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404,
                text: jest.fn(),
            })

            const result = await loadUrl("https://example.com/missing.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "notReadable",
                    message: "Failed to load URL [https://example.com/missing.txt]. Status 404",
                    severity: "error",
                    context: {
                        operation: "loadText",
                        filename: "https://example.com/missing.txt",
                    },
                }),
            )
            expect(recorded.counts).toEqual(["fileops.loadText.url.failure"])
            expect(recorded.durations).toEqual([
                {name: "fileops.loadText.url.ms", durationMs: 5},
            ])
        })

        it("returns invalidUrl when fetch throws", async () => {
            const cause = new Error("network")
            ;(global.fetch as jest.Mock).mockRejectedValue(cause)

            const result = await loadUrl("https://example.com/a.txt", {
                observability: recorded.observability,
            })

            expect(result).toEqual(
                errors({
                    kind: "invalidUrl",
                    message: "Failed to load URL [https://example.com/a.txt]",
                    severity: "error",
                    context: {
                        operation: "loadText",
                        filename: "https://example.com/a.txt",
                        cause,
                    },
                }),
            )
            expect(recorded.counts).toEqual(["fileops.loadText.url.failure"])
            expect(recorded.durations).toEqual([
                {name: "fileops.loadText.url.ms", durationMs: 5},
            ])
        })

        it("works without observability", async () => {
            ;(global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                status: 200,
                text: jest.fn().mockResolvedValue("text"),
            })

            const result = await loadUrl("https://example.com/a.txt")

            expect(result).toEqual(value("text"))
        })
    })
})