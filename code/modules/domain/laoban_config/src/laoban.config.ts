import type { MergeOptions } from "@laoban/merge"
import type { DirectoryName, Filename, FileOps, LoadTextConfig } from "@laoban/files"
import type { ErrorsOr } from "@laoban/errors"
import type { Observability } from "@laoban/observability"

import type { LaobanScripts, RawLaobanScripts } from "@laoban/scripts"
import {OsOps} from "@laoban/os";

export type PackageManagerName = string
export type FileOrUrl = string

export interface LaobanConfig {
    packageManager: PackageManagerName
    versionFile: string
    parents: FileOrUrl[]
    properties: Record<string, string>
    templates: Record<string, FileOrUrl>
    defaultEnv: Record<string, string>
    scripts: LaobanScripts
    skipDirectories: string[]
    throttle: number
}

export type LaobanConfigFile = Partial<
    Omit<LaobanConfig, "scripts">
> & {
    scripts?: RawLaobanScripts
}

export type LaobanConfigDiagnosticContext = Readonly<{
    currentFile?: Filename
    loadPath: Filename[]
}>

export interface LaobanConfigLoadConfig {
    fileOps: FileOps
    osOps: OsOps
    loadTextConfig: LoadTextConfig
    observability: Observability
    markerFileName: Filename
    mergeOptions?: MergeOptions
}

export interface LoadedLaobanConfig {
    config: LaobanConfig
    configFile: Filename
    configDirectory: DirectoryName
    loadedFiles: Filename[]
}

export type LaobanConfigLoader = (
    config: LaobanConfigLoadConfig,
    start: Filename | DirectoryName
) => Promise<ErrorsOr<LoadedLaobanConfig>>