import { ErrorsOr } from "@laoban/errors";
import { nullObservability, Observability } from "@laoban/observability";

export type Filename = string;
export type DirectoryName = string;
export type FileOrUrl = string;
export type LoadTextSource = string;


export type FileOpIssueKind =
    | "notFound"
    | "notReadable"
    | "invalidPath"
    | "invalidUrl"
    | "unknownMarker"
    | "io"
    | "unexpected";

export type FileOpIssueContext = Readonly<{
    operation: string;
    filename?: FileOrUrl;
    resolvedFilename?: string;
    marker?: string;
    start?: DirectoryName;
    markerFileName?: Filename;
    cause?: unknown;
}>;

export type FileOpIssue = Readonly<{
    kind: FileOpIssueKind;
    message: string;
    context?: FileOpIssueContext;
    code?: string;
    severity?: "error" | "warning";
}>;

export type LoadFileFn = (
    filename: FileOrUrl,
    config?: LoadTextConfig
) => Promise<ErrorsOr<string, FileOpIssue>>;

export type LoadUrlFn = (
    url: string,
    config?: LoadTextConfig
) => Promise<ErrorsOr<string, FileOpIssue>>;

export type FileExistsFn = (
    filename: FileOrUrl,
    config?: FindContainingDirectoryConfig
) => Promise<ErrorsOr<boolean, FileOpIssue>>;

export interface PathOps {
    dirname(directory: DirectoryName): DirectoryName;
    resolvePath(path: string): DirectoryName;
    joinPath(directory: DirectoryName, filename: Filename): FileOrUrl;
}

export interface LoadTextInfrastructure {
    loadFile: LoadFileFn;
    loadUrl: LoadUrlFn;
}

export interface FindContainingDirectoryInfrastructure {
    fileExists: FileExistsFn;
    pathOps: PathOps;
}

export type LoadTextConfig = Readonly<{
    observability?: Observability;
    markers?: Readonly<Record<string, string>>;
    infrastructure?: LoadTextInfrastructure;
}>;

export type RequiredLoadTextConfig = Readonly<{
    observability: Observability;
    markers: Readonly<Record<string, string>>;
    infrastructure: LoadTextInfrastructure;
}>;

export type LoadTextDefaults = Readonly<{
    infrastructure: LoadTextInfrastructure;
}>;

export const defaultLoadTextConfig = (
    defaults: LoadTextDefaults,
    config: LoadTextConfig = {}
): RequiredLoadTextConfig => ({
    observability: config.observability ?? nullObservability(),
    markers: config.markers ?? {},
    infrastructure: config.infrastructure ?? defaults.infrastructure,
});

export type FindContainingDirectoryConfig = Readonly<{
    observability?: Observability;
    infrastructure?: FindContainingDirectoryInfrastructure;
}>;

export type RequiredFindContainingDirectoryConfig = Readonly<{
    observability: Observability;
    infrastructure: FindContainingDirectoryInfrastructure;
}>;

export type FindContainingDirectoryDefaults = Readonly<{
    infrastructure: FindContainingDirectoryInfrastructure;
}>;

export const defaultFindContainingDirectoryConfig = (
    defaults: FindContainingDirectoryDefaults,
    config: FindContainingDirectoryConfig = {}
): RequiredFindContainingDirectoryConfig => ({
    observability: config.observability ?? nullObservability(),
    infrastructure: config.infrastructure ?? defaults.infrastructure,
});

/**
 * Port for reading text resources and discovering workspace marker directories.
 *
 * This is an effectful boundary. Core logic should depend on this interface
 * rather than directly using Node filesystem or network APIs.
 */
export interface FileOps {
    /**
     * Starting from a directory, walk upwards until a directory containing
     * the given marker file is found.
     *
     * Returns the directory containing the marker file.
     */
    findContainingDirectory(
        start: DirectoryName,
        markerFileName: Filename,
        config?: FindContainingDirectoryConfig
    ): Promise<ErrorsOr<DirectoryName, FileOpIssue>>;

    /**
     * Load a UTF-8 text resource from a local file, a URL, or a marker-prefixed source.
     */
    loadText(
        source: LoadTextSource,
        config?: LoadTextConfig
    ): Promise<ErrorsOr<string, FileOpIssue>>;
}

export const makeFileOpIssue = (
    kind: FileOpIssueKind,
    message: string,
    context?: FileOpIssueContext,
    cause?: unknown,
    code?: string,
): FileOpIssue => ({
    kind,
    message,
    ...(context === undefined
        ? {}
        : {
            context:
                cause === undefined
                    ? context
                    : { ...context, cause },
        }),
    ...(code === undefined ? {} : { code }),
    severity: "error",
});