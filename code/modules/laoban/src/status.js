"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettyPrintData = exports.toPrettyPrintData = exports.toStatusDetails = exports.printStatus = exports.writeCompactedStatus = exports.compactStatus = void 0;
var utils_1 = require("./utils");
var fs = require("fs");
function readOrBlank(file) {
    try {
        return fs.readFileSync(file).toString();
    }
    catch (e) {
        return "";
    }
}
function compactStatus(statusFile) {
    var lines = readOrBlank(statusFile);
    var map = new Map();
    lines.split("\n").forEach(function (line) {
        var groups = line.split(" ");
        if (groups && groups[2])
            map.set(groups[2], line);
    });
    return map;
}
exports.compactStatus = compactStatus;
function writeCompactedStatus(statusFile, statusMap) {
    var keys = __spreadArrays(statusMap.keys()).sort();
    var compacted = keys.map(function (k) { return statusMap.get(k); }).join("\n") + "\n";
    return fs.writeFile(statusFile, compacted, function (err) {
        if (err)
            console.log('error compacting status', statusFile, statusMap, compacted);
    });
}
exports.writeCompactedStatus = writeCompactedStatus;
function printStatus(directory, statusMap) {
    var regex = /^([^ ]*) ([^ ]*) (.*)/;
    var keys = __spreadArrays(statusMap.keys());
    keys.sort();
    var width = 10; // Strings.maxLength(keys)
    console.log(directory);
    keys.forEach(function (k) {
        var value = statusMap.get(k);
        var groups = value.match(regex);
        if (groups)
            console.log('  ', k.padEnd(width), groups[2].padEnd(5), groups[1]);
        else
            console.log('  Status file error', value);
    });
}
exports.printStatus = printStatus;
function stringToStatusDetails(directory, s) {
    var regex = /^([^ ]*) ([^ ]*) (.*)/;
    var groups = s.match(regex);
    var result = { directory: directory, timestamp: groups[1], status: groups[2], command: groups[3] };
    return result;
}
function toStatusDetails(ds) {
    var result = ds.map(function (d) { return __spreadArrays(d.compactedStatusMap.keys()).map(function (command) { return stringToStatusDetails(d.directory, d.compactedStatusMap.get(command)); }); });
    return [].concat.apply([], result);
}
exports.toStatusDetails = toStatusDetails;
function toPrettyPrintData(sds) {
    var directories = __spreadArrays(new Set(sds.map(function (sd) { return sd.directory; })));
    var directoriesWidth = utils_1.Strings.maxLength(directories);
    var commandTitles = __spreadArrays(new Set(sds.map(function (sd) { return sd.command; }))).sort();
    var commandsTitles = __spreadArrays([''], commandTitles).map(function (d) { return ({ value: d, width: Math.max(5, d.length) }); }); //later might want more sophisticated
    var directoryToCommandToData = new Map();
    sds.forEach(function (sd) {
        var existingCommandToData = directoryToCommandToData.get(sd.directory);
        var map = existingCommandToData ? existingCommandToData : new Map();
        map.set(sd.command, sd.status);
        directoryToCommandToData.set(sd.directory, map);
    });
    return ({ commandsTitles: commandsTitles, directories: directories, directoriesWidth: directoriesWidth, directoryToCommandToData: directoryToCommandToData });
}
exports.toPrettyPrintData = toPrettyPrintData;
function prettyPrintData(pretty) {
    console.log(''.padEnd(pretty.directoriesWidth), pretty.commandsTitles.map(function (ct) { return ct.value.padEnd(ct.width); }).join(' '));
    pretty.directories.forEach(function (d) { return console.log(d.padEnd(pretty.directoriesWidth), pretty.commandsTitles.map(function (ct) {
        var value = pretty.directoryToCommandToData.get(d).get(ct.value);
        return (value ? value : "").padEnd(ct.width);
    }).join(' ')); });
}
exports.prettyPrintData = prettyPrintData;
