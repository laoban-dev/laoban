import path from "path"
import {access, mkdir, readFile, readdir, writeFile} from "fs/promises"

import {errors, ErrorsOr, value} from "@laoban/errors"
import {
    defaultFileOpsHelperConfig,
    FileExistsFn,
    FileOpsHelperConfig,
    FileOpsHelperDefaults,
    FileOpIssue,
    FileOpIssueKind,
    FileOrUrl,
    FindContainingDirectoryDefaults,
    ListDirectoryFn,
    LoadFileFn,
    LoadTextConfig,
    LoadTextDefaults,
    LoadUrlFn,
    makeFileOpIssue,
    PathOps,
    WriteTextFn,
} from "@laoban/files"

export type WriteTextDefaults = FileOpsHelperDefaults

export type FileOpsDefaults = Readonly<{
    findContainingDirectory: FindContainingDirectoryDefaults
    findAllByNameUnder: FileOpsHelperDefaults
    loadText: LoadTextDefaults
    writeText: WriteTextDefaults
    pathOps: PathOps
}>

const extractCode = (cause: unknown): string | undefined =>
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof (cause as {code?: unknown}).code === "string"
        ? (cause as {code: string}).code
        : undefined

const fileIssueKind = (code: string | undefined): FileOpIssueKind =>
    code === "ENOENT"
        ? "notFound"
        : code === "EACCES" || code === "EPERM"
            ? "notReadable"
            : code === "ENOTDIR"
                ? "invalidPath"
                : "io"

type HasObservability = Readonly<{
    observability?: FileOpsHelperConfig["observability"]
}>

const now = (observability?: {timeService?: {now: () => number}}): number =>
    observability?.timeService?.now() ?? Date.now()

const nodeFileExists: FileExistsFn = async (
    filename: FileOrUrl,
    config?: HasObservability,
) => {
    const observability = config?.observability
    const start = now(observability)

    try {
        await access(filename)

        observability?.countMetric("fileops.fileExists.success")
        observability?.durationMetric(
            "fileops.fileExists.ms",
            now(observability) - start,
        )

        return value(true)
    } catch (cause) {
        const code = extractCode(cause)

        observability?.durationMetric(
            "fileops.fileExists.ms",
            now(observability) - start,
        )

        if (code === "ENOENT") {
            observability?.countMetric("fileops.fileExists.notFound")
            return value(false)
        }

        observability?.countMetric("fileops.fileExists.failure")

        return errors<FileOpIssue>(
            makeFileOpIssue(
                filename,
                fileIssueKind(code),
                `Failed checking existence of [${filename}]`,
                {
                    operation: "fileExists",
                },
                cause,
                code,
            ),
        )
    }
}

const nodeListDirectory: ListDirectoryFn = async (
    directory,
    config,
) => {
    const observability = config?.observability
    const start = now(observability)

    try {
        const entries = await readdir(directory)

        observability?.countMetric("fileops.listDirectory.success")
        observability?.durationMetric(
            "fileops.listDirectory.ms",
            now(observability) - start,
        )

        return value(entries)
    } catch (cause) {
        const code = extractCode(cause)

        observability?.countMetric("fileops.listDirectory.failure")
        observability?.durationMetric(
            "fileops.listDirectory.ms",
            now(observability) - start,
        )

        return errors<FileOpIssue>(
            makeFileOpIssue(
                directory,
                fileIssueKind(code),
                `Failed listing directory [${directory}]`,
                {
                    operation: "listDirectory",
                },
                cause,
                code,
            ),
        )
    }
}

const nodeLoadFile: LoadFileFn = async (
    filename: FileOrUrl,
    config?: LoadTextConfig,
) => {
    const observability = config?.observability
    const start = now(observability)

    try {
        const text = await readFile(filename, "utf8")

        observability?.countMetric("fileops.loadText.file.success")
        observability?.durationMetric(
            "fileops.loadText.file.ms",
            now(observability) - start,
        )

        return value(text)
    } catch (cause) {
        const code = extractCode(cause)

        observability?.countMetric("fileops.loadText.file.failure")
        observability?.durationMetric(
            "fileops.loadText.file.ms",
            now(observability) - start,
        )

        return errors<FileOpIssue>(
            makeFileOpIssue(
                filename,
                fileIssueKind(code),
                `Failed to read file [${filename}]`,
                {
                    operation: "loadText",
                },
                cause,
                code,
            ),
        )
    }
}

const nodeLoadUrl: LoadUrlFn = async (
    url: string,
    config?: LoadTextConfig,
) => {
    const observability = config?.observability
    const start = now(observability)

    try {
        const response = await fetch(url)

        if (!response.ok) {
            observability?.countMetric("fileops.loadText.url.failure")
            observability?.durationMetric(
                "fileops.loadText.url.ms",
                now(observability) - start,
            )

            return errors<FileOpIssue>(
                makeFileOpIssue(
                    url,
                    "notReadable",
                    `Failed to load URL [${url}]. Status ${response.status}`,
                    {
                        operation: "loadText",
                    },
                ),
            )
        }

        const text = await response.text()

        observability?.countMetric("fileops.loadText.url.success")
        observability?.durationMetric(
            "fileops.loadText.url.ms",
            now(observability) - start,
        )

        return value(text)
    } catch (cause) {
        observability?.countMetric("fileops.loadText.url.failure")
        observability?.durationMetric(
            "fileops.loadText.url.ms",
            now(observability) - start,
        )

        return errors<FileOpIssue>(
            makeFileOpIssue(
                url,
                "invalidUrl",
                `Failed to load URL [${url}]`,
                {
                    operation: "loadText",
                },
                cause,
            ),
        )
    }
}

const nodeWriteText: WriteTextFn = async (
    filename,
    content,
    config,
) => {
    const observability = config?.observability
    const start = now(observability)

    try {
        await mkdir(path.dirname(filename), {recursive: true})
        await writeFile(filename, content, "utf8")

        observability?.countMetric("fileops.writeText.success")
        observability?.durationMetric(
            "fileops.writeText.ms",
            now(observability) - start,
        )

        return value(undefined)
    } catch (cause) {
        const code = extractCode(cause)

        observability?.countMetric("fileops.writeText.failure")
        observability?.durationMetric(
            "fileops.writeText.ms",
            now(observability) - start,
        )

        return errors<FileOpIssue>(
            makeFileOpIssue(
                filename,
                fileIssueKind(code),
                `Failed to write file [${filename}]`,
                {
                    operation: "writeText",
                },
                cause,
                code,
            ),
        )
    }
}

export const writeText =
    (defaults: WriteTextDefaults): WriteTextFn =>
        (
            filename,
            content,
            config,
        ): Promise<ErrorsOr<void, FileOpIssue>> => {
            const resolvedConfig = defaultFileOpsHelperConfig(defaults, config)

            return resolvedConfig.infrastructure.writeText(
                filename,
                content,
                resolvedConfig,
            )
        }

export const nodePathOps: PathOps = {
    dirname: directory => path.dirname(directory),
    resolvePath: somePath => path.resolve(somePath),
    joinPath: (directory, filename) => path.join(directory, filename),
}

const nodeFileOpsHelperInfrastructure = {
    fileExists: nodeFileExists,
    listDirectory: nodeListDirectory,
    writeText: nodeWriteText,
    pathOps: nodePathOps,
}

const nodeFileOpsHelperDefaults: FileOpsHelperDefaults = {
    infrastructure: nodeFileOpsHelperInfrastructure,
}

export const nodeFileOpsDefaults: FileOpsDefaults = {
    findContainingDirectory: {
        infrastructure: {
            fileExists: nodeFileExists,
            pathOps: nodePathOps,
        },
    },
    findAllByNameUnder: nodeFileOpsHelperDefaults,
    loadText: {
        infrastructure: {
            loadFile: nodeLoadFile,
            loadUrl: nodeLoadUrl,
        },
    },
    writeText: nodeFileOpsHelperDefaults,
    pathOps: nodePathOps,
}