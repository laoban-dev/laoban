import { promises as fs } from "fs";

import { ErrorsOr, errors, value } from "@laoban/errors";
import { defaultLoadTextConfig, FileOpIssue, FileOpIssueKind, FileOrUrl, LoadTextConfig, LoadTextSource, RequiredLoadTextConfig } from "./fileops";

const isHttpUrl = (source: string): boolean =>
    source.startsWith("http://") || source.startsWith("https://");

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

export const defaultLoadFile = async (
    filename: FileOrUrl,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const { observability } = defaultLoadTextConfig(
        { loadFile: defaultLoadFile, loadUrl: defaultLoadUrl },
        config,
    );
    const start = Date.now();

    observability.debug("load", "debug", "Loading file", filename);

    try {
        const text = await fs.readFile(filename, "utf8");
        observability.countMetric("fileops.load.file.success");
        observability.durationMetric("fileops.load.file.ms", Date.now() - start);
        return value(text);
    } catch (cause) {
        observability.countMetric("fileops.load.file.failure");
        observability.durationMetric("fileops.load.file.ms", Date.now() - start);
        return errors(classifyFileError(filename, cause));
    }
};

export const defaultLoadUrl = async (
    url: string,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const { observability } = defaultLoadTextConfig(
        { loadFile: defaultLoadFile, loadUrl: defaultLoadUrl },
        config,
    );
    const start = Date.now();

    observability.debug("load", "debug", "Loading URL", url);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            observability.countMetric("fileops.load.url.failure");
            observability.durationMetric("fileops.load.url.ms", Date.now() - start);
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
        observability.countMetric("fileops.load.url.success");
        observability.durationMetric("fileops.load.url.ms", Date.now() - start);
        return value(text);
    } catch (cause) {
        observability.countMetric("fileops.load.url.failure");
        observability.durationMetric("fileops.load.url.ms", Date.now() - start);
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

export const loadFromMarker = async (
    source: LoadTextSource,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const fullConfig = defaultLoadTextConfig(
        { loadFile: defaultLoadFile, loadUrl: defaultLoadUrl },
        config,
    );
    const { observability, markers } = fullConfig;

    observability.debug("load", "debug", "Trying marker resolution", source);

    for (const [marker, replacement] of Object.entries(markers)) {
        if (source.startsWith(marker)) {
            const resolvedSource = `${replacement}${source.slice(marker.length)}`;
            observability.debug("load", "debug", "Resolved marker", {
                source,
                marker,
                resolvedSource,
            });
            return loadText(resolvedSource, fullConfig);
        }
    }

    return errors(
        makeIssue(
            "unknownMarker",
            `Unknown marker in source [${source}]`,
            {
                operation: "load",
                filename: source,
            },
        ),
    );
};

export const loadText = async (
    source: LoadTextSource,
    config?: LoadTextConfig,
): Promise<ErrorsOr<string, FileOpIssue>> => {
    const fullConfig: RequiredLoadTextConfig = defaultLoadTextConfig(
        { loadFile: defaultLoadFile, loadUrl: defaultLoadUrl },
        config,
    );
    const { observability, loadFile, loadUrl } = fullConfig;

    observability.debug("load", "debug", "Loading text source", source);

    if (isHttpUrl(source)) return loadUrl(source, fullConfig);
    if (source.startsWith("@")) return loadFromMarker(source, fullConfig);
    return loadFile(source, fullConfig);
};