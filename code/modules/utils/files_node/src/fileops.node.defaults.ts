import path from "path";
import {access, readFile, readdir} from "fs/promises";

import {errors, value} from "@laoban/errors";
import {
    FileExistsFn,
    FileOpsHelperConfig,
    FileOpIssue,
    FileOpIssueKind,
    FileOrUrl,
    FindContainingDirectoryConfig,
    ListDirectoryFn,
    LoadFileFn,
    LoadTextConfig,
    LoadUrlFn,
    makeFileOpIssue, PathOps,
} from "@laoban/files";
import {FileOpsDefaults} from "./fileops.node";

const makeIssue = (
    kind: FileOpIssueKind,
    message: string,
    context: FileOpIssue["context"],
    cause?: unknown,
    code?: string,
): FileOpIssue => makeFileOpIssue(kind, message, context, cause, code);

const extractCode = (cause: unknown): string | undefined =>
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof (cause as { code?: unknown }).code === "string"
        ? (cause as { code: string }).code
        : undefined;

type HasObservability = Readonly<{
    observability?: FileOpsHelperConfig["observability"];
}>;

const now = (observability?: { timeService?: { now: () => number } }): number =>
    observability?.timeService?.now() ?? Date.now();

const nodeFileExists: FileExistsFn = async (
    filename: FileOrUrl,
    config?: HasObservability,
) => {
    const observability = config?.observability;
    const start = now(observability);

    try {
        await access(filename);

        observability?.countMetric("fileops.findContainingDirectory.fileExists.success");
        observability?.durationMetric(
            "fileops.findContainingDirectory.fileExists.ms",
            now(observability) - start,
        );

        return value(true);
    } catch (cause) {
        const code = extractCode(cause);

        observability?.durationMetric(
            "fileops.findContainingDirectory.fileExists.ms",
            now(observability) - start,
        );

        if (code === "ENOENT") {
            observability?.countMetric("fileops.findContainingDirectory.fileExists.notFound");
            return value(false);
        }

        observability?.countMetric("fileops.findContainingDirectory.fileExists.failure");

        return errors<FileOpIssue>(
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

const nodeListDirectory: ListDirectoryFn = async (
    directory,
    config,
) => {
    const observability = config?.observability;
    const start = now(observability);

    try {
        const entries = await readdir(directory);

        observability?.countMetric("fileops.findAllByNameUnder.listDirectory.success");
        observability?.durationMetric(
            "fileops.findAllByNameUnder.listDirectory.ms",
            now(observability) - start,
        );

        return value(entries);
    } catch (cause) {
        const code = extractCode(cause);
        const kind: FileOpIssueKind =
            code === "ENOENT"
                ? "notFound"
                : code === "EACCES" || code === "EPERM"
                    ? "notReadable"
                    : "io";

        observability?.countMetric("fileops.findAllByNameUnder.listDirectory.failure");
        observability?.durationMetric(
            "fileops.findAllByNameUnder.listDirectory.ms",
            now(observability) - start,
        );

        return errors<FileOpIssue>(
            makeIssue(
                kind,
                `Failed listing directory [${directory}]`,
                {
                    operation: "findContainingDirectory",
                    filename: directory,
                },
                cause,
                code,
            ),
        );
    }
};

const nodeLoadFile: LoadFileFn = async (
    filename: FileOrUrl,
    config?: LoadTextConfig,
) => {
    const observability = config?.observability;
    const start = now(observability);

    try {
        const text = await readFile(filename, "utf8");

        observability?.countMetric("fileops.load.file.success");
        observability?.durationMetric(
            "fileops.load.file.ms",
            now(observability) - start,
        );

        return value(text);
    } catch (cause) {
        const code = extractCode(cause);
        const kind: FileOpIssueKind =
            code === "ENOENT"
                ? "notFound"
                : code === "EACCES" || code === "EPERM"
                    ? "notReadable"
                    : "io";

        observability?.countMetric("fileops.load.file.failure");
        observability?.durationMetric(
            "fileops.load.file.ms",
            now(observability) - start,
        );

        return errors<FileOpIssue>(
            makeIssue(
                kind,
                `Failed to read file [${filename}]`,
                {
                    operation: "load",
                    filename,
                },
                cause,
                code,
            ),
        );
    }
};

const nodeLoadUrl: LoadUrlFn = async (
    url: string,
    config?: LoadTextConfig,
) => {
    const observability = config?.observability;
    const start = now(observability);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            observability?.countMetric("fileops.load.url.failure");
            observability?.durationMetric(
                "fileops.load.url.ms",
                now(observability) - start,
            );

            return errors<FileOpIssue>(
                makeIssue(
                    "notReadable",
                    `Failed to load URL [${url}]. Status ${response.status}`,
                    {
                        operation: "load",
                        filename: url,
                    },
                ),
            );
        }

        const text = await response.text();

        observability?.countMetric("fileops.load.url.success");
        observability?.durationMetric(
            "fileops.load.url.ms",
            now(observability) - start,
        );

        return value(text);
    } catch (cause) {
        observability?.countMetric("fileops.load.url.failure");
        observability?.durationMetric(
            "fileops.load.url.ms",
            now(observability) - start,
        );

        return errors<FileOpIssue>(
            makeIssue(
                "invalidUrl",
                `Failed to load URL [${url}]`,
                {
                    operation: "load",
                    filename: url,
                },
                cause,
            ),
        );
    }
};

export const nodePathOps: PathOps = {
    dirname: directory => path.dirname(directory),
    resolvePath: somePath => path.resolve(somePath),
    joinPath: (directory, filename) => path.join(directory, filename),
};
export const nodeFileOpsDefaults: FileOpsDefaults = {
    findContainingDirectory: {
        infrastructure: {
            fileExists: nodeFileExists,
            pathOps: nodePathOps,
        },
    },
    loadText: {
        infrastructure: {
            loadFile: nodeLoadFile,
            loadUrl: nodeLoadUrl,
        },
    },
    findAllByNameUnder: {
        infrastructure: {
            fileExists: nodeFileExists,
            listDirectory: nodeListDirectory,
            pathOps: {
                dirname: path.dirname,
                resolvePath: path.resolve,
                joinPath: (directory, filename) => path.join(directory, filename),
            },
        },
    },
    pathOps: nodePathOps
};