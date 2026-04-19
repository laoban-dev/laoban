import path from "path";
import { access, readFile } from "fs/promises";

import { errors, value } from "@laoban/errors";
import { realTimeService } from "@laoban/observability";
import {
    DirectoryName,
    DirnameFn,
    FileExistsFn,
    FileOpIssue,
    FileOpIssueKind,
    FileOrUrl,
    Filename,
    FindContainingDirectoryConfig,
    JoinPathFn,
    LoadFileFn,
    LoadTextConfig,
    LoadUrlFn,
    ResolvePathFn,
    makeFileOpIssue,
} from "@laoban/files";

const errorCode = (cause: unknown): string | undefined =>
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof (cause as { code?: unknown }).code === "string"
        ? (cause as { code: string }).code
        : undefined;

const classifyFileReadError = (
    filename: FileOrUrl,
    cause: unknown,
): FileOpIssue => {
    const code = errorCode(cause);

    const kind: FileOpIssueKind =
        code === "ENOENT"
            ? "notFound"
            : code === "EACCES" || code === "EPERM"
                ? "notReadable"
                : "io";

    return makeFileOpIssue(
        kind,
        `Failed to read file [${filename}]`,
        {
            operation: "load",
            filename,
        },
        cause,
        code,
    );
};

const classifyExistsCheckError = (
    filename: FileOrUrl,
    cause: unknown,
): FileOpIssue => {
    const code = errorCode(cause);

    return makeFileOpIssue(
        code === "EACCES" || code === "EPERM" ? "notReadable" : "io",
        `Failed checking existence of [${filename}]`,
        {
            operation: "findContainingDirectory",
            filename,
        },
        cause,
        code,
    );
};

const timeServiceFor = (
    config?: LoadTextConfig | FindContainingDirectoryConfig,
) => config?.observability?.timeService ?? realTimeService;

export const nodeLoadFile: LoadFileFn = async (
    filename: FileOrUrl,
    config?: LoadTextConfig,
) => {
    const observability = config?.observability;
    const timeService = timeServiceFor(config);
    const start = timeService.now();

    try {
        const text = await readFile(filename, "utf8");
        observability?.countMetric("fileops.load.file.success");
        observability?.durationMetric("fileops.load.file.ms", timeService.now() - start);
        return value(text);
    } catch (cause) {
        observability?.countMetric("fileops.load.file.failure");
        observability?.durationMetric("fileops.load.file.ms", timeService.now() - start);
        return errors(classifyFileReadError(filename, cause));
    }
};

export const nodeLoadUrl: LoadUrlFn = async (
    url: string,
    config?: LoadTextConfig,
) => {
    const observability = config?.observability;
    const timeService = timeServiceFor(config);
    const start = timeService.now();

    try {
        const response = await fetch(url);

        if (!response.ok) {
            observability?.countMetric("fileops.load.url.failure");
            observability?.durationMetric("fileops.load.url.ms", timeService.now() - start);
            return errors(
                makeFileOpIssue(
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
        observability?.durationMetric("fileops.load.url.ms", timeService.now() - start);
        return value(text);
    } catch (cause) {
        observability?.countMetric("fileops.load.url.failure");
        observability?.durationMetric("fileops.load.url.ms", timeService.now() - start);
        return errors(
            makeFileOpIssue(
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

export const nodeFileExists: FileExistsFn = async (
    filename: FileOrUrl,
    config?: FindContainingDirectoryConfig,
) => {
    const observability = config?.observability;
    const timeService = timeServiceFor(config);
    const start = timeService.now();

    try {
        await access(filename);
        observability?.countMetric("fileops.findContainingDirectory.fileExists.success");
        observability?.durationMetric(
            "fileops.findContainingDirectory.fileExists.ms",
            timeService.now() - start,
        );
        return value(true);
    } catch (cause) {
        const code = errorCode(cause);

        observability?.durationMetric(
            "fileops.findContainingDirectory.fileExists.ms",
            timeService.now() - start,
        );

        if (code === "ENOENT") {
            observability?.countMetric("fileops.findContainingDirectory.fileExists.notFound");
            return value(false);
        }

        observability?.countMetric("fileops.findContainingDirectory.fileExists.failure");
        return errors(classifyExistsCheckError(filename, cause));
    }
};

export const nodeDirname: DirnameFn = (
    directory: DirectoryName,
): DirectoryName => path.dirname(directory);

export const nodeResolvePath: ResolvePathFn = (
    pathName: string,
): DirectoryName => path.resolve(pathName);

export const nodeJoinPath: JoinPathFn = (
    directory: DirectoryName,
    filename: Filename,
): FileOrUrl => path.join(directory, filename);