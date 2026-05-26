import {ErrorsOr, errors, value} from "@laoban/errors"
import {
    defaultFindContainingDirectoryConfig,
    DirectoryName,
    Filename,
    FindContainingDirectoryConfig,
    FindContainingDirectoryDefaults,
    FileOpIssue,
    FileOpIssueContext,
    FileOpIssueKind,
    makeFileOpIssue,
} from "./fileops"

const makeIssue = (
    currentFile: DirectoryName,
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

export const findContainingDirectory =
    (defaults: FindContainingDirectoryDefaults) =>
        async (
            start: DirectoryName,
            markerFileName: Filename,
            config: FindContainingDirectoryConfig = {},
        ): Promise<ErrorsOr<DirectoryName, FileOpIssue>> => {
            const fullConfig = defaultFindContainingDirectoryConfig(defaults, config)

            const {
                fileExists,
                pathOps: {dirname, resolvePath, joinPath},
            } = fullConfig.infrastructure

            const resolvedStart = resolvePath(start)

            let current = resolvedStart
            let previous = ""

            while (current !== previous) {
                const candidate = joinPath(current, markerFileName)
                const exists = await fileExists(candidate, fullConfig)

                if ("errors" in exists)
                    return exists

                if (exists.value)
                    return value(current)

                previous = current
                current = dirname(current)
            }

            return errors(
                makeIssue(
                    resolvedStart,
                    "notFound",
                    `Could not find containing directory for marker file [${markerFileName}] starting at [${start}]`,
                    {
                        operation: "findContainingDirectory",
                        start,
                        markerFileName,
                    },
                ),
            )
        }