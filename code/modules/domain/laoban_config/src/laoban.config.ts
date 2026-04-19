import { MergeOptions } from "@laoban/merge";
import {DirectoryName, Filename, FileOps} from "@laoban/files";
import {ErrorsOr} from "@laoban/errors";
import {Observability} from "@laoban/observability";

export type PackageManagerName = string;
export type FileOrUrl = string;

export interface LaobanConfig<Script> {
    packageManager: PackageManagerName;
    versionFile: string;
    parents: FileOrUrl[];
    properties: Record<string, string>;
    templates: Record<string, FileOrUrl>;
    defaultEnv: Record<string, string>;
    scripts: Record<string, Script>;
    skipDirectories: string[];
}

export type LaobanConfigFile<Script> = Partial<LaobanConfig<Script>>;

export type LaobanConfigLoadContext =
    | "find"
    | "load"
    | "parse"
    | "parents"
    | "merge";

export interface LoadLaobanConfigConfig<Context extends string = LaobanConfigLoadContext> {
    fileOps: FileOps;
    observability: Observability<Context>;
    markerFileName: Filename;
    mergeOptions?: MergeOptions;
}

export interface LoadedLaobanConfig<Script> {
    config: LaobanConfig<Script>;
    configFile: Filename;
    configDirectory: DirectoryName;
    loadedFiles: Filename[];
}

export type FindLaobanConfigFile<Context extends string = LaobanConfigLoadContext> = (
    config: LoadLaobanConfigConfig<Context>,
    start: Filename | DirectoryName
) => Promise<ErrorsOr<Filename>>;

export type LoadOneLaobanConfigFile<
    Script,
    Context extends string = LaobanConfigLoadContext
> = (
    config: LoadLaobanConfigConfig<Context>,
    file: Filename
) => Promise<ErrorsOr<LaobanConfigFile<Script>>>;

export type LaobanConfigLoader<
    Script,
    Context extends string = LaobanConfigLoadContext
> = (
    config: LoadLaobanConfigConfig<Context>,
    start: Filename | DirectoryName
) => Promise<ErrorsOr<LoadedLaobanConfig<Script>>>;