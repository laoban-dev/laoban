import {isErrors, value, type ErrorsOr} from "@laoban/errors";
import {
    defaultFileOpsHelperConfig,
    type DirectoryName,
    type Filename,
    type FileOpIssue,
    type FileOpsHelperConfig,
    type FileOpsHelperDefaults
} from "./fileops";

export const findAllByNameUnder = (defaults: FileOpsHelperDefaults) =>
    async (
        directory: DirectoryName,
        targetFileName: Filename,
        config: FileOpsHelperConfig = {}
    ): Promise<ErrorsOr<Filename[], FileOpIssue>> => {
        const fullConfig = defaultFileOpsHelperConfig(defaults, config);
        const {listDirectory, fileExists, pathOps} = fullConfig.infrastructure;
        const ignoreDirectories = new Set(fullConfig.ignoreDirectories);

        const recurse = async (currentDirectory: DirectoryName): Promise<ErrorsOr<Filename[], FileOpIssue>> => {
            const results: Filename[] = [];

            const targetPath = pathOps.joinPath(currentDirectory, targetFileName);
            const existsE = await fileExists(targetPath, fullConfig);
            if (isErrors(existsE)) return existsE;
            if (existsE.value) results.push(targetPath);

            const childrenE = await listDirectory(currentDirectory, fullConfig);
            if (isErrors(childrenE)) return childrenE;

            for (const child of childrenE.value) {
                if (ignoreDirectories.has(child)) continue;

                const childPath = pathOps.joinPath(currentDirectory, child);
                const childChildrenE = await listDirectory(childPath, fullConfig);

                if (isErrors(childChildrenE)) continue;

                const childResultsE = await recurse(childPath);
                if (isErrors(childResultsE)) return childResultsE;

                results.push(...childResultsE.value);
            }

            return value(results);
        };

        const result = await recurse(directory);
        if (isErrors(result)) return result;
        return value([...result.value].sort());
    };