import {FileOps, findContainingDirectory, loadText} from "@laoban/files";
import {
    nodeDirname,
    nodeFileExists,
    nodeJoinPath,
    nodeLoadFile,
    nodeLoadUrl,
    nodeResolvePath,
} from "./fileops.node.defaults";

export const fileOpsNode = (): FileOps => ({
    loadText: (source, config = {}) =>
        loadText(source, {
            ...config,
            loadFile: config.loadFile ?? nodeLoadFile,
            loadUrl: config.loadUrl ?? nodeLoadUrl,
        }),

    findContainingDirectory: (start, markerFileName, config = {}) =>
        findContainingDirectory(start, markerFileName, {
            ...config,
            fileExists: config.fileExists ?? nodeFileExists,
            dirname: config.dirname ?? nodeDirname,
            resolvePath: config.resolvePath ?? nodeResolvePath,
            joinPath: config.joinPath ?? nodeJoinPath,
        }),
});