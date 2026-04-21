import {errors, value, type ErrorsOr} from "@laoban/errors";
import {
    type DirectoryName,
    type Filename,
    type FileOpIssue,
    type FileOpsHelperConfig,
    type FileOpsHelperDefaults,
    makeFileOpIssue
} from "@laoban/files";
import {findAllByNameUnder as makeFindAllByNameUnder} from "@laoban/files";
import * as fs from "fs/promises";
import * as path from "path";

const pathOps = {
    dirname: (directory: DirectoryName): DirectoryName => path.dirname(directory),
    resolvePath: (p: string): DirectoryName => path.resolve(p),
    joinPath: (directory: DirectoryName, filename: Filename): string => path.join(directory, filename)
};

export const nodeFileExists = async (
    filename: string,
    _config?: FileOpsHelperConfig
): Promise<ErrorsOr<boolean, FileOpIssue>> => {
    try {
        await fs.access(filename);
        return value(true);
    } catch {
        return value(false);
    }
};

export const nodeListDirectory = async (
    directory: DirectoryName,
    _config?: FileOpsHelperConfig
): Promise<ErrorsOr<Filename[], FileOpIssue>> => {
    try {
        const stat = await fs.stat(directory);
        if (!stat.isDirectory()) {
            return errors(
                makeFileOpIssue(
                    "invalidPath",
                    `${directory} is not a directory`,
                    {
                        operation: "fileops.listDirectory",
                        directory
                    },
                    undefined,
                    "notDirectory"
                )
            );
        }

        const names = await fs.readdir(directory);
        return value(names);
    } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;

        if (err?.code === "ENOENT") {
            return errors(
                makeFileOpIssue(
                    "notFound",
                    `Directory not found: ${directory}`,
                    {
                        operation: "fileops.listDirectory",
                        directory
                    },
                    e,
                    "ENOENT"
                )
            );
        }

        if (err?.code === "EACCES" || err?.code === "EPERM") {
            return errors(
                makeFileOpIssue(
                    "notReadable",
                    `Directory is not readable: ${directory}`,
                    {
                        operation: "fileops.listDirectory",
                        directory
                    },
                    e,
                    err.code
                )
            );
        }

        return errors(
            makeFileOpIssue(
                "io",
                `Unable to list directory: ${directory}`,
                {
                    operation: "fileops.listDirectory",
                    directory
                },
                e,
                err?.code
            )
        );
    }
};

export const nodeFindAllByNameUnderDefaults: FileOpsHelperDefaults = {
    infrastructure: {
        fileExists: nodeFileExists,
        listDirectory: nodeListDirectory,
        pathOps
    }
};

export const nodeFindAllByNameUnder = makeFindAllByNameUnder(nodeFindAllByNameUnderDefaults);