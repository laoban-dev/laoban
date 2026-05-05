import {FileOps, findAllByNameUnder, findContainingDirectory, loadText,} from "@laoban/files"
import {writeText} from "./fileops.write.text";
import {FileOpsDefaults} from "./fileops.node.defaults";

export const nodeFileOps = (defaults: FileOpsDefaults): FileOps => ({
    findContainingDirectory: (start, markerFileName, config) =>
        findContainingDirectory(defaults.findContainingDirectory)(start, markerFileName, config),

    findAllByNameUnder: (directory, targetFileName, config) =>
        findAllByNameUnder(defaults.findAllByNameUnder)(directory, targetFileName, config),

    loadText: (source, config) =>
        loadText(defaults.loadText)(source, config),

    writeText: (filename, content, config) =>
        writeText(defaults.writeText)(filename, content, config),

    pathOps: defaults.pathOps,
})