import { ErrorsOr } from "@laoban/errors";

export type Filename = string;
export type DirectoryName = string;

export interface FileOps {
    /**
     * Starting from a file or directory, walk upwards until a directory
     * containing the given marker file is found.
     *
     * Returns the directory containing the marker file.
     */
    findContainingDirectory(start: DirectoryName, markerFileName: Filename): Promise<ErrorsOr<string>>;

    /**
     * Load a UTF-8 text file from the local filesystem.
     */
    loadTextFile(filename: Filename): Promise<ErrorsOr<string>>;
}