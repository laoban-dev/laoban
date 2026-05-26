import {CommonIssue, ErrorsOr, fileIssue, FileIssue} from "@laoban/errors"
import {nullObservability, Observability} from "@laoban/observability"

export type Filename = string
export type DirectoryName = string
export type FileOrUrl = string
export type LoadTextSource = string

export type FileNameAndContent = {
    filename: Filename
    content: string
}

export type FileOpIssueKind =
    | "notFound"
    | "notReadable"
    | "invalidPath"
    | "invalidUrl"
    | "unknownMarker"
    | "io"
    | "unexpected"

export type FileOpIssueContext = Readonly<{
    operation: string
    filename?: FileOrUrl
    resolvedFilename?: string
    marker?: string
    start?: DirectoryName
    markerFileName?: Filename
    directory?: DirectoryName
    targetFileName?: Filename
    ignoreDirectories?: Filename[]
    cause?: unknown
}>

export type FileOpIssue = FileIssue<FileOpIssueKind, FileOpIssueContext>

export type LoadFileFn = (
    filename: FileOrUrl,
    config?: LoadTextConfig,
) => Promise<ErrorsOr<string, FileOpIssue>>

export type LoadUrlFn = (
    url: string,
    config?: LoadTextConfig,
) => Promise<ErrorsOr<string, FileOpIssue>>

export type WriteTextFn = (
    filename: Filename,
    content: string,
    config?: FileOpsHelperConfig,
) => Promise<ErrorsOr<void, FileOpIssue>>

export interface WriteTextFileOps {
    writeText: WriteTextFn
}

export type FileExistsFn = (
    filename: FileOrUrl,
    config?: FindContainingDirectoryConfig | FileOpsHelperConfig,
) => Promise<ErrorsOr<boolean, FileOpIssue>>

export type ListDirectoryFn = (
    directory: DirectoryName,
    config?: FileOpsHelperConfig,
) => Promise<ErrorsOr<Filename[], FileOpIssue>>

export interface PathOps {
    dirname(directory: DirectoryName): DirectoryName
    resolvePath(path: string): DirectoryName
    joinPath(directory: DirectoryName, filename: Filename): FileOrUrl
}

export interface LoadTextInfrastructure {
    loadFile: LoadFileFn
    loadUrl: LoadUrlFn
}

export interface FindContainingDirectoryInfrastructure {
    fileExists: FileExistsFn
    pathOps: PathOps
}

export interface FileOpsHelperInfrastructure {
    fileExists: FileExistsFn
    listDirectory: ListDirectoryFn
    writeText: WriteTextFn
    pathOps: PathOps
}

export type LoadTextConfig = Readonly<{
    observability?: Observability
    markers?: Readonly<Record<string, string>>
    infrastructure?: LoadTextInfrastructure
}>

export type RequiredLoadTextConfig = Readonly<{
    observability: Observability
    markers: Readonly<Record<string, string>>
    infrastructure: LoadTextInfrastructure
}>

export type LoadTextDefaults = Readonly<{
    infrastructure: LoadTextInfrastructure
}>

export const defaultLoadTextConfig = (
    defaults: LoadTextDefaults,
    config: LoadTextConfig = {},
): RequiredLoadTextConfig => ({
    observability: config.observability ?? nullObservability(),
    markers: config.markers ?? {},
    infrastructure: config.infrastructure ?? defaults.infrastructure,
})

export type FindContainingDirectoryConfig = Readonly<{
    observability?: Observability
    infrastructure?: FindContainingDirectoryInfrastructure
}>

export type RequiredFindContainingDirectoryConfig = Readonly<{
    observability: Observability
    infrastructure: FindContainingDirectoryInfrastructure
}>

export type FindContainingDirectoryDefaults = Readonly<{
    infrastructure: FindContainingDirectoryInfrastructure
}>

export const defaultFindContainingDirectoryConfig = (
    defaults: FindContainingDirectoryDefaults,
    config: FindContainingDirectoryConfig = {},
): RequiredFindContainingDirectoryConfig => ({
    observability: config.observability ?? nullObservability(),
    infrastructure: config.infrastructure ?? defaults.infrastructure,
})

export const defaultIgnoreDirectories: Filename[] = [".git", "node_modules"]

export type FileOpsHelperConfig = Readonly<{
    observability?: Observability
    infrastructure?: FileOpsHelperInfrastructure
    ignoreDirectories?: Filename[]
}>

export type RequiredFileOpsHelperConfig = Readonly<{
    observability: Observability
    infrastructure: FileOpsHelperInfrastructure
    ignoreDirectories: Filename[]
}>

export type FileOpsHelperDefaults = Readonly<{
    infrastructure: FileOpsHelperInfrastructure
    ignoreDirectories?: Filename[]
}>

export const defaultFileOpsHelperConfig = (
    defaults: FileOpsHelperDefaults,
    config: FileOpsHelperConfig = {},
): RequiredFileOpsHelperConfig => ({
    observability: config.observability ?? nullObservability(),
    infrastructure: config.infrastructure ?? defaults.infrastructure,
    ignoreDirectories: config.ignoreDirectories ?? defaults.ignoreDirectories ?? defaultIgnoreDirectories,
})

/**
 * Port for reading/writing text resources and discovering workspace marker directories.
 *
 * This is an effectful boundary. Core logic should depend on this interface
 * rather than directly using Node filesystem or network APIs.
 */
export interface FileOps extends WriteTextFileOps {
    findContainingDirectory(
        start: DirectoryName,
        markerFileName: Filename,
        config?: FindContainingDirectoryConfig,
    ): Promise<ErrorsOr<DirectoryName, FileOpIssue>>

    findAllByNameUnder(
        directory: DirectoryName,
        targetFileName: Filename,
        config?: FileOpsHelperConfig,
    ): Promise<ErrorsOr<Filename[], FileOpIssue>>

    loadText(
        source: LoadTextSource,
        config?: LoadTextConfig,
    ): Promise<ErrorsOr<string, FileOpIssue>>

    pathOps: PathOps
}

export const makeFileOpIssue = (
    currentFile: FileOrUrl,
    kind: FileOpIssueKind,
    message: string,
    context?: FileOpIssueContext,
    cause?: unknown,
    code?: string,
): FileOpIssue =>
    fileIssue(
        currentFile,
        {
            kind,
            message,
            ...(context === undefined
                ? {}
                : {
                    context:
                        cause === undefined
                            ? context
                            : {...context, cause},
                }),
            ...(code === undefined ? {} : {code}),
            severity: "error",
        },
    )