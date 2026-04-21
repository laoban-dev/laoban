import {
    FileOps,
    findAllByNameUnder,
    findContainingDirectory,
    FileOpsHelperDefaults,
    FindContainingDirectoryDefaults,
    loadText,
    LoadTextDefaults
} from "@laoban/files";

export type FileOpsDefaults = Readonly<{
    findContainingDirectory: FindContainingDirectoryDefaults;
    findAllByNameUnder: FileOpsHelperDefaults;
    loadText: LoadTextDefaults;
}>;

export const nodeFileOps = (defaults: FileOpsDefaults): FileOps => ({
    findContainingDirectory: (start, markerFileName, config) =>
        findContainingDirectory(defaults.findContainingDirectory)(start, markerFileName, config),

    findAllByNameUnder: (directory, targetFileName, config) =>
        findAllByNameUnder(defaults.findAllByNameUnder)(directory, targetFileName, config),

    loadText: (source, config) =>
        loadText(defaults.loadText)(source, config),
});