import { ErrorsOr } from "@laoban/errors";
import { nullObservability, Observability } from "@laoban/observability";

export type Filename = string;
export type DirectoryName = string;
export type FileOrUrl = string;
export type LoadTextSource = string;

export type FileDebugContext = "load" | "findContainingDirectory";

export type FileOpIssueKind =
    | "notFound"
    | "notReadable"
    | "invalidPath"
    | "invalidUrl"
    | "unknownMarker"
    | "io"
    | "unexpected";

export type FileOpIssue = Readonly<{
    kind: FileOpIssueKind;
    message: string;
    context?: Readonly<{
        operation: FileDebugContext;
        filename?: FileOrUrl;
        resolvedFilename?: string;
        marker?: string;
        start?: DirectoryName;
        markerFileName?: Filename;
        cause?: unknown;
    }>;
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

export type DirnameFn = (
    directory: DirectoryName
) => DirectoryName;

export type ResolvePathFn = (
    path: string
) => DirectoryName;
export type JoinPathFn = (
    directory: DirectoryName,
    filename: Filename
) => FileOrUrl;
export type LoadTextConfig = Readonly<{
    observability?: Observability<FileDebugContext>;
    markers?: Readonly<Record<string, string>>;
    loadFile?: LoadFileFn;
    loadUrl?: LoadUrlFn;
}>;

export type RequiredLoadTextConfig = Readonly<{
    observability: Observability<FileDebugContext>;
    markers: Readonly<Record<string, string>>;
    loadFile: LoadFileFn;
    loadUrl: LoadUrlFn;
}>;

export type LoadTextDefaults = Readonly<{
    loadFile: LoadFileFn;
    loadUrl: LoadUrlFn;
}>;

export const defaultLoadTextConfig = (
    defaults: LoadTextDefaults,
    config: LoadTextConfig = {}
): RequiredLoadTextConfig => ({
    observability: config.observability ?? nullObservability<FileDebugContext>(),
    markers: config.markers ?? {},
    loadFile: config.loadFile ?? defaults.loadFile,
    loadUrl: config.loadUrl ?? defaults.loadUrl,
});

export type FindContainingDirectoryConfig = Readonly<{
    observability?: Observability<FileDebugContext>;
    fileExists?: FileExistsFn;
    dirname?: DirnameFn;
    resolvePath?: ResolvePathFn;
    joinPath?: JoinPathFn;
}>;

export type RequiredFindContainingDirectoryConfig = Readonly<{
    observability: Observability<FileDebugContext>;
    fileExists: FileExistsFn;
    dirname: DirnameFn;
    resolvePath: ResolvePathFn;
    joinPath: JoinPathFn;
}>;

export type FindContainingDirectoryDefaults = Readonly<{
    fileExists: FileExistsFn;
    dirname: DirnameFn;
    resolvePath: ResolvePathFn;
    joinPath: JoinPathFn;
}>;

export const defaultFindContainingDirectoryConfig = (
    defaults: FindContainingDirectoryDefaults,
    config: FindContainingDirectoryConfig = {}
): RequiredFindContainingDirectoryConfig => ({
    observability: config.observability ?? nullObservability<FileDebugContext>(),
    fileExists: config.fileExists ?? defaults.fileExists,
    dirname: config.dirname ?? defaults.dirname,
    resolvePath: config.resolvePath ?? defaults.resolvePath,
    joinPath: config.joinPath ?? defaults.joinPath,
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
    context?: FileOpIssue["context"],
    cause?: unknown,
    code?: string,
): FileOpIssue => ({
    kind,
    message,
    ...(context === undefined && cause === undefined ? {} : {
        context: cause === undefined ? context : { ...context, cause },
    }),
    ...(code === undefined ? {} : { code }),
    severity: "error",
});