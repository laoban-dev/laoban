import { promises as fs } from "fs";

import { ErrorsOr, errors, value } from "@laoban/errors";
import {
    FileOpIssue,
    FileOpIssueKind,
    FileOrUrl,
    LoadTextConfig,
    LoadTextInfrastructure,
    makeFileOpIssue,
} from "@laoban/files";

const makeIssue = (
    kind: FileOpIssueKind,
    message: string,
    context: FileOpIssue["context"],
    cause?: unknown,
    code?: string,
): FileOpIssue => makeFileOpIssue(kind, message, context, cause, code);

const classifyFileError = (
    filename: FileOrUrl,
    cause: unknown,
): FileOpIssue => {
    const code =
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        typeof (cause as { code?: unknown }).code === "string"
            ? (cause as { code: string }).code
            : undefined;

    const kind: FileOpIssueKind =
        code === "ENOENT"
            ? "notFound"
            : code === "EACCES" || code === "EPERM"
                ? "notReadable"
                : "io";

    return makeIssue(
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

export const nodeLoadFile = async (
    filename: FileOrUrl,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const observability = config?.observability;
    const start = observability?.timeService.now() ?? Date.now();

    try {
        const text = await fs.readFile(filename, "utf8");
        observability?.countMetric("fileops.load.file.success");
        observability?.durationMetric(
            "fileops.load.file.ms",
            (observability?.timeService.now() ?? Date.now()) - start,
        );
        return value(text);
    } catch (cause) {
        observability?.countMetric("fileops.load.file.failure");
        observability?.durationMetric(
            "fileops.load.file.ms",
            (observability?.timeService.now() ?? Date.now()) - start,
        );
        return errors(classifyFileError(filename, cause));
    }
};

export const nodeLoadUrl = async (
    url: string,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const observability = config?.observability;
    const start = observability?.timeService.now() ?? Date.now();

    try {
        const response = await fetch(url);

        if (!response.ok) {
            observability?.countMetric("fileops.load.url.failure");
            observability?.durationMetric(
                "fileops.load.url.ms",
                (observability?.timeService.now() ?? Date.now()) - start,
            );
            return errors(
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
            (observability?.timeService.now() ?? Date.now()) - start,
        );
        return value(text);
    } catch (cause) {
        observability?.countMetric("fileops.load.url.failure");
        observability?.durationMetric(
            "fileops.load.url.ms",
            (observability?.timeService.now() ?? Date.now()) - start,
        );
        return errors(
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

export const nodeLoadTextInfrastructure: LoadTextInfrastructure = {
    loadFile: nodeLoadFile,
    loadUrl: nodeLoadUrl,
};