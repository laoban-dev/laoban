import {errors, value, valueOrThrow} from "@laoban/errors"
import {FileOpIssue, WriteTextFileOps, WriteTextFn} from "@laoban/files"
import {recordingObservability} from "@laoban/observability"
import {
    debugManagedFile,
    updateManagedFiles,
    updateOneManagedFile,
    UpdateManagedFilesConfig,
} from "./update.file.operations"

describe("updateManagedFiles", () => {
    function writeTextMock(
        fn: WriteTextFn = async () => value(undefined),
    ): jest.MockedFunction<WriteTextFn> {
        return jest.fn(fn) as jest.MockedFunction<WriteTextFn>
    }

    function makeFileOps(writeText: jest.MockedFunction<WriteTextFn> = writeTextMock()): WriteTextFileOps {
        return {writeText}
    }

    function makeConfig(overrides: Partial<UpdateManagedFilesConfig> = {}): UpdateManagedFilesConfig {
        const recording = recordingObservability()

        return {
            observability: recording.observability,
            fileOps: makeFileOps(),
            debug: false,
            dryRun: false,
            ...overrides,
        }
    }

    function countMetric(counts: string[], name: string): number {
        return counts.filter(count => count === name).length
    }

    it("writes every planned file and records metrics", async () => {
        const recording = recordingObservability()
        const writeText = writeTextMock()
        const config = makeConfig({
            observability: recording.observability,
            fileOps: makeFileOps(writeText),
        })

        const result = await updateManagedFiles(config, [
            {filename: "alpha/README.md", content: "alpha"},
            {filename: "beta/README.md", content: "beta"},
        ])

        expect(valueOrThrow(result)).toEqual({
            files: 2,
            written: 2,
            skipped: 0,
        })

        expect(writeText).toHaveBeenCalledTimes(2)
        expect(writeText).toHaveBeenNthCalledWith(1, "alpha/README.md", "alpha", undefined)
        expect(writeText).toHaveBeenNthCalledWith(2, "beta/README.md", "beta", undefined)
        expect(recording.logs).toEqual([])

        expect(countMetric(recording.counts, "managedFiles.update.files.requested")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.file.requested")).toBe(2)
        expect(countMetric(recording.counts, "managedFiles.update.file.written")).toBe(2)
        expect(countMetric(recording.counts, "managedFiles.update.files.completed")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.files.written")).toBe(2)
        expect(countMetric(recording.counts, "managedFiles.update.files.skipped")).toBe(0)
    })

    it("passes fileOpsHelperConfig to writeText", async () => {
        const writeText = writeTextMock()
        const fileOpsHelperConfig = {ignoreDirectories: [".git"]} as any
        const config = makeConfig({
            fileOps: makeFileOps(writeText),
            fileOpsHelperConfig,
        })

        await updateOneManagedFile(config, {
            filename: "alpha/package.json",
            content: "{}",
        })

        expect(writeText).toHaveBeenCalledWith(
            "alpha/package.json",
            "{}",
            fileOpsHelperConfig,
        )
    })

    it("logs file and content when debug is true", async () => {
        const recording = recordingObservability()
        const writeText = writeTextMock()
        const config = makeConfig({
            observability: recording.observability,
            fileOps: makeFileOps(writeText),
            debug: true,
        })

        const result = await updateOneManagedFile(config, {
            filename: "alpha/README.md",
            content: "hello",
        })

        expect(valueOrThrow(result)).toEqual({
            filename: "alpha/README.md",
            written: true,
        })

        expect(recording.logs).toHaveLength(2)
        expect(recording.logs[0].msg).toContain("Managed file: alpha/README.md")
        expect(recording.logs[1].msg).toContain("hello")
        expect(writeText).toHaveBeenCalledTimes(1)

        expect(countMetric(recording.counts, "managedFiles.update.file.requested")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.file.written")).toBe(1)
    })

    it("logs but does not write when dryRun is true", async () => {
        const recording = recordingObservability()
        const writeText = writeTextMock()
        const config = makeConfig({
            observability: recording.observability,
            fileOps: makeFileOps(writeText),
            dryRun: true,
        })

        const result = await updateOneManagedFile(config, {
            filename: "alpha/README.md",
            content: "hello",
        })

        expect(valueOrThrow(result)).toEqual({
            filename: "alpha/README.md",
            written: false,
        })

        expect(recording.logs).toHaveLength(2)
        expect(recording.logs[0].msg).toContain("Managed file: alpha/README.md")
        expect(recording.logs[1].msg).toContain("hello")
        expect(writeText).not.toHaveBeenCalled()

        expect(countMetric(recording.counts, "managedFiles.update.file.requested")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.file.skipped")).toBe(1)
    })

    it("counts dryRun files as skipped", async () => {
        const recording = recordingObservability()
        const writeText = writeTextMock()
        const config = makeConfig({
            observability: recording.observability,
            fileOps: makeFileOps(writeText),
            dryRun: true,
        })

        const result = await updateManagedFiles(config, [
            {filename: "alpha/README.md", content: "alpha"},
            {filename: "beta/README.md", content: "beta"},
        ])

        expect(valueOrThrow(result)).toEqual({
            files: 2,
            written: 0,
            skipped: 2,
        })

        expect(writeText).not.toHaveBeenCalled()

        expect(countMetric(recording.counts, "managedFiles.update.files.requested")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.file.requested")).toBe(2)
        expect(countMetric(recording.counts, "managedFiles.update.file.skipped")).toBe(2)
        expect(countMetric(recording.counts, "managedFiles.update.files.completed")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.files.skipped")).toBe(2)
    })

    it("returns write errors", async () => {
        const recording = recordingObservability()
        const issue: FileOpIssue = {
            kind: "io",
            message: "Could not write file",
            context: {
                operation: "writeText",
                filename: "alpha/README.md",
            },
            severity: "error",
        }

        const writeText = writeTextMock(async () => errors(issue))
        const config = makeConfig({
            observability: recording.observability,
            fileOps: makeFileOps(writeText),
        })

        const result = await updateManagedFiles(config, [
            {filename: "alpha/README.md", content: "alpha"},
        ])

        expect(result).toEqual(errors(issue))
        expect(countMetric(recording.counts, "managedFiles.update.files.requested")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.file.requested")).toBe(1)
        expect(countMetric(recording.counts, "managedFiles.update.file.written")).toBe(0)
        expect(countMetric(recording.counts, "managedFiles.update.files.completed")).toBe(0)
    })

    it("debugManagedFile logs file and content", () => {
        const recording = recordingObservability()
        const config = makeConfig({
            observability: recording.observability,
        })

        debugManagedFile(config, {
            filename: "alpha/README.md",
            content: "hello",
        })

        expect(recording.logs).toHaveLength(2)
        expect(recording.logs[0].msg).toContain("Managed file: alpha/README.md")
        expect(recording.logs[1].msg).toContain("hello")
    })
})