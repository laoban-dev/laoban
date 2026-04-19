import path from "path";
import {access} from "fs/promises";

import {ErrorsOr, errors, value} from "@laoban/errors";
import {
    defaultFindContainingDirectoryConfig,
    DirectoryName,
    FileExistsFn,
    Filename,
    FindContainingDirectoryConfig,
    FileOpIssue,
    FileOpIssueKind,
} from "./fileops";

const makeIssue = (
    kind: FileOpIssueKind,
    message: string,
    context: FileOpIssue["context"],
    cause?: unknown,
    code?: string,
): FileOpIssue => ({
    kind,
    message,
    context: cause === undefined ? context : {...context, cause},
    ...(code === undefined ? {} : {code}),
    severity: "error",
});

export const defaultFindContainingDirectoryFileExists: FileExistsFn = async filename => {
    try {
        await access(filename);
        return value(true);
    } catch (cause) {
        const code =
            typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            typeof (cause as { code?: unknown }).code === "string"
                ? (cause as { code: string }).code
                : undefined;

        if (code === "ENOENT") return value(false);

        return errors(
            makeIssue(
                code === "EACCES" || code === "EPERM" ? "notReadable" : "io",
                `Failed checking existence of [${filename}]`,
                {
                    operation: "findContainingDirectory",
                    filename,
                },
                cause,
                code,
            ),
        );
    }
};

export const defaultFindContainingDirectoryDirname = (
    directory: DirectoryName,
): DirectoryName => path.dirname(directory);

export const defaultFindContainingDirectoryResolvePath = (
    somePath: string,
): DirectoryName => path.resolve(somePath);

export const findContainingDirectory = async (
    start: DirectoryName,
    markerFileName: Filename,
    config: FindContainingDirectoryConfig = {},
): Promise<ErrorsOr<DirectoryName, FileOpIssue>> => {
    const fullConfig = defaultFindContainingDirectoryConfig(
        {
            fileExists: defaultFindContainingDirectoryFileExists,
            dirname: defaultFindContainingDirectoryDirname,
            resolvePath: defaultFindContainingDirectoryResolvePath,
        },
        config,
    );

    const {observability, fileExists, dirname, resolvePath} = fullConfig;

    observability.debug(
        "findContainingDirectory",
        "debug",
        "Searching for containing directory",
        {start, markerFileName},
    );

    let current = resolvePath(start);
    let previous = "";

    while (current !== previous) {
        const candidate = path.join(current, markerFileName);

        observability.debug(
            "findContainingDirectory",
            "debug",
            "Checking candidate",
            candidate,
        );

        const exists = await fileExists(candidate);

        if ("errors" in exists) return exists;
        if (exists.value) return value(current);

        previous = current;
        current = dirname(current);
    }

    return errors(
        makeIssue(
            "notFound",
            `Could not find containing directory for marker file [${markerFileName}] starting at [${start}]`,
            {
                operation: "findContainingDirectory",
                start,
                markerFileName,
            },
        ),
    );
};