import {
    FileOps,
    findContainingDirectory,
    FindContainingDirectoryDefaults,
    loadText,
    LoadTextDefaults
} from "@laoban/files";

export type FileOpsDefaults = Readonly<{
    findContainingDirectory: FindContainingDirectoryDefaults;
    loadText: LoadTextDefaults;
}>;

export const fileOps = (defaults: FileOpsDefaults): FileOps => ({
    findContainingDirectory: (start, markerFileName, config) =>
        findContainingDirectory(defaults.findContainingDirectory)(start, markerFileName, config),

    loadText: (source, config) =>
        loadText(defaults.loadText)(source, config),
});