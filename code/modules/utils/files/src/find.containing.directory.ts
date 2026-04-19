import path from "path";
import { access } from "fs/promises";

import { ErrorsOr, errors, value } from "@laoban/errors";
import {
    defaultFindContainingDirectoryConfig,
    DirectoryName,
    FileExistsFn,
    Filename,
    FindContainingDirectoryConfig,
    FileOpIssue,
    FileOpIssueKind,
    JoinPathFn,
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
    context: cause === undefined ? context : { ...context, cause },
    ...(code === undefined ? {} : { code }),
    severity: "error",
});

export const defaultFindContainingDirectoryFileExists: FileExistsFn = async (
    filename,
    config,
) => {
    const observability = config?.observability;
    const start = Date.now();

    try {
        await access(filename);
        observability?.countMetric("fileops.findContainingDirectory.fileExists.success");
        observability?.durationMetric(
            "fileops.findContainingDirectory.fileExists.ms",
            Date.now() - start,
        );
        return value(true);
    } catch (cause) {
        const code =
            typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            typeof (cause as { code?: unknown }).code === "string"
                ? (cause as { code: string }).code
                : undefined;

        observability?.durationMetric(
            "fileops.findContainingDirectory.fileExists.ms",
            Date.now() - start,
        );

        if (code === "ENOENT") {
            observability?.countMetric("fileops.findContainingDirectory.fileExists.notFound");
            return value(false);
        }

        observability?.countMetric("fileops.findContainingDirectory.fileExists.failure");
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

export const defaultFindContainingDirectoryJoinPath: JoinPathFn = (
    directory: DirectoryName,
    filename: Filename,
): string => path.join(directory, filename);

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
            joinPath: defaultFindContainingDirectoryJoinPath,
        },
        config,
    );

    const { fileExists, dirname, resolvePath, joinPath } = fullConfig;

    let current = resolvePath(start);
    let previous = "";

    while (current !== previous) {
        const candidate = joinPath(current, markerFileName);
        const exists = await fileExists(candidate, fullConfig);

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