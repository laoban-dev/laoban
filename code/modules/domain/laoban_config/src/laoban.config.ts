import type { MergeOptions } from "@laoban/merge";
import type {DirectoryName, Filename, FileOps, LoadTextConfig} from "@laoban/files";
import type { ErrorsOr } from "@laoban/errors";
import type { Observability } from "@laoban/observability";

import type {
    LaobanScripts,
    RawLaobanScripts,
} from "@laoban/scripts";

export type PackageManagerName = string;
export type FileOrUrl = string;

export interface LaobanConfig {
    packageManager: PackageManagerName;
    versionFile: string;
    parents: FileOrUrl[];
    properties: Record<string, string>;
    templates: Record<string, FileOrUrl>;
    defaultEnv: Record<string, string>;
    scripts: LaobanScripts;
    skipDirectories: string[];
}

export interface LaobanConfigFile {
    packageManager?: PackageManagerName;
    versionFile?: string;
    parents?: FileOrUrl[];
    properties?: Record<string, string>;
    templates?: Record<string, FileOrUrl>;
    defaultEnv?: Record<string, string>;
    scripts?: RawLaobanScripts;
    skipDirectories?: string[];
}

export type LaobanConfigLoadArea =
    | "find"
    | "load"
    | "parse"
    | "parents"
    | "merge"
    | "validate";

export type LaobanConfigDiagnosticContext = Readonly<{
    currentFile?: Filename;
    loadPath: Filename[];
}>;

export interface LaobanConfigLoadConfig<
    Area extends string = LaobanConfigLoadArea
> {
    fileOps: FileOps;
    loadTextConfig: LoadTextConfig
    observability: Observability<Area>;
    markerFileName: Filename;
    mergeOptions?: MergeOptions;
}

export interface LoadedLaobanConfig {
    config: LaobanConfig;
    configFile: Filename;
    configDirectory: DirectoryName;
    loadedFiles: Filename[];
}

export type LaobanConfigLoader<
    Area extends string = LaobanConfigLoadArea
> = (
    config: LaobanConfigLoadConfig<Area>,
    start: Filename | DirectoryName
) => Promise<ErrorsOr<LoadedLaobanConfig>>;