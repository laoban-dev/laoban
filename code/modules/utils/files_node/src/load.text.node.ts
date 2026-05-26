import {promises as fs} from "fs"

import {ErrorsOr, errors, value} from "@laoban/errors"
import {
    FileOpIssue,
    FileOpIssueContext,
    FileOpIssueKind,
    FileOrUrl,
    LoadTextConfig,
    LoadTextInfrastructure,
    makeFileOpIssue,
} from "@laoban/files"

const makeIssue = (
    currentFile: FileOrUrl,
    kind: FileOpIssueKind,
    message: string,
    context: FileOpIssueContext,
    cause?: unknown,
    code?: string,
): FileOpIssue =>
    makeFileOpIssue(
        currentFile,
        kind,
        message,
        context,
        cause,
        code,
    )

const classifyFileError = (
    filename: FileOrUrl,
    cause: unknown,
): FileOpIssue => {
    const code =
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        typeof (cause as {code?: unknown}).code === "string"
            ? (cause as {code: string}).code
            : undefined

    const kind: FileOpIssueKind =
        code === "ENOENT"
            ? "notFound"
            : code === "EACCES" || code === "EPERM"
                ? "notReadable"
                : "io"

    return makeIssue(
        filename,
        kind,
        `Failed to read file [${filename}]`,
        {
            operation: "load",
        },
        cause,
        code,
    )
}

export const nodeLoadFile = async (
    filename: FileOrUrl,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const observability = config?.observability
    const start = observability?.timeService.now() ?? Date.now()

    try {
        const text = await fs.readFile(filename, "utf8")

        observability?.countMetric("fileops.load.file.success")
        observability?.durationMetric(
            "fileops.load.file.ms",
            (observability?.timeService.now() ?? Date.now()) - start,
        )

        return value(text)
    } catch (cause) {
        observability?.countMetric("fileops.load.file.failure")
        observability?.durationMetric(
            "fileops.load.file.ms",
            (observability?.timeService.now() ?? Date.now()) - start,
        )

        return errors(classifyFileError(filename, cause))
    }
}

export const nodeLoadUrl = async (
    url: string,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const observability = config?.observability
    const start = observability?.timeService.now() ?? Date.now()

    try {
        const response = await fetch(url)

        if (!response.ok) {
            observability?.countMetric("fileops.load.url.failure")
            observability?.durationMetric(
                "fileops.load.url.ms",
                (observability?.timeService.now() ?? Date.now()) - start,
            )

            return errors(
                makeIssue(
                    url,
                    "notReadable",
                    `Failed to load URL [${url}]. Status ${response.status}`,
                    {
                        operation: "load",
                    },
                ),
            )
        }

        const text = await response.text()

        observability?.countMetric("fileops.load.url.success")
        observability?.durationMetric(
            "fileops.load.url.ms",
            (observability?.timeService.now() ?? Date.now()) - start,
        )

        return value(text)
    } catch (cause) {
        observability?.countMetric("fileops.load.url.failure")
        observability?.durationMetric(
            "fileops.load.url.ms",
            (observability?.timeService.now() ?? Date.now()) - start,
        )

        return errors(
            makeIssue(
                url,
                "invalidUrl",
                `Failed to load URL [${url}]`,
                {
                    operation: "load",
                },
                cause,
            ),
        )
    }
}

export const nodeLoadTextInfrastructure: LoadTextInfrastructure = {
    loadFile: nodeLoadFile,
    loadUrl: nodeLoadUrl,
}