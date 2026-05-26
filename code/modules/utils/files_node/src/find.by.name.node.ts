import {errors, value, type ErrorsOr} from "@laoban/errors"
import {
    type DirectoryName,
    type Filename,
    type FileExistsFn,
    type FileOpIssue,
    type FileOpsHelperConfig,
    type ListDirectoryFn,
    makeFileOpIssue,
} from "@laoban/files"
import * as fs from "fs/promises"
import * as path from "path"

export const pathOps = {
    dirname: (directory: DirectoryName): DirectoryName => path.dirname(directory),
    resolvePath: (p: string): DirectoryName => path.resolve(p),
    joinPath: (directory: DirectoryName, filename: Filename): string =>
        path.join(directory, filename),
}

type HasObservability = Readonly<{
    observability?: FileOpsHelperConfig["observability"]
}>

const codeFrom = (e: unknown): string | undefined =>
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as {code?: unknown}).code === "string"
        ? (e as {code: string}).code
        : undefined

export const nodeFileExists: FileExistsFn = async (
    filename,
    _config?: HasObservability,
): Promise<ErrorsOr<boolean, FileOpIssue>> => {
    try {
        await fs.access(filename)
        return value(true)
    } catch {
        return value(false)
    }
}

export const nodeListDirectory: ListDirectoryFn = async (
    directory,
    _config?: FileOpsHelperConfig,
): Promise<ErrorsOr<Filename[], FileOpIssue>> => {
    try {
        const stat = await fs.stat(directory)

        if (!stat.isDirectory()) {
            return errors(
                makeFileOpIssue(
                    directory,
                    "invalidPath",
                    `${directory} is not a directory`,
                    {
                        operation: "fileops.listDirectory",
                    },
                    undefined,
                    "notDirectory",
                ),
            )
        }

        const names = await fs.readdir(directory)
        return value(names)
    } catch (e: unknown) {
        const code = codeFrom(e)

        if (code === "ENOENT") {
            return errors(
                makeFileOpIssue(
                    directory,
                    "notFound",
                    `Directory not found: ${directory}`,
                    {
                        operation: "fileops.listDirectory",
                    },
                    e,
                    code,
                ),
            )
        }

        if (code === "EACCES" || code === "EPERM") {
            return errors(
                makeFileOpIssue(
                    directory,
                    "notReadable",
                    `Directory is not readable: ${directory}`,
                    {
                        operation: "fileops.listDirectory",
                    },
                    e,
                    code,
                ),
            )
        }

        return errors(
            makeFileOpIssue(
                directory,
                "io",
                `Unable to list directory: ${directory}`,
                {
                    operation: "fileops.listDirectory",
                },
                e,
                code,
            ),
        )
    }
}