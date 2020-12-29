"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettyPrintProfiles = exports.prettyPrintProfileData = exports.findProfilesFromString = exports.loadProfile = void 0;
var fs = require("fs");
var path = require("path");
var utils_1 = require("./utils");
function loadProfile(config, directory) {
    return new Promise(function (resolve, reject) {
        fs.readFile(path.join(directory, config.profile), function (err, data) {
            if (err)
                resolve("");
            if (data)
                resolve(data.toString());
        });
    });
}
exports.loadProfile = loadProfile;
function findProfilesFromString(s) {
    if (s) {
        var count_1 = {};
        var total_1 = {};
        var latest_1 = {};
        s.split('\n').filter(function (l) { return l.length > 0; }).forEach(function (line) {
            var parts = line.split(" ");
            var key = parts[1];
            var duration = Number(parts[2]);
            if (duration > 0) {
                latest_1[key] = duration;
                count_1[key] = (count_1[key] ? count_1[key] + 1 : 1);
                total_1[key] = (total_1[key] ? total_1[key] : 0) + duration;
            }
        });
        var result = {};
        for (var k in count_1) {
            result[k] = ({ count: count_1[k], average: Math.round(total_1[k] / count_1[k]), latest: latest_1[k] });
        }
        return result;
    }
    else
        return ({});
}
exports.findProfilesFromString = findProfilesFromString;
function prettyPrintProfileData(profiles) {
    var directories = profiles.map(function (pd) { return pd.directory; });
    var directoryWidth = utils_1.Strings.maxLength(directories);
    // let x = [...new Set(profiles.map(p => Object.keys(p.profile)))]
    var commandTitles = new Set();
    profiles.forEach(function (p) { return Object.keys(p.profile).forEach(function (k) { return commandTitles.add(k); }); });
    var commandTitlesAndWidths = __spreadArrays(commandTitles).sort().map(function (t) { return ({ value: t, width: Math.max(7, t.length) }); });
    return ({ directoryWidth: directoryWidth, commandTitlesAndWidths: commandTitlesAndWidths, data: profiles });
}
exports.prettyPrintProfileData = prettyPrintProfileData;
function getValueToDisplay(fn, pd, cw) {
    if (cw)
        if (pd.profile[cw.value])
            return fn(pd.profile[cw.value]);
    return "";
}
function prettyPrintProfiles(print, title, p, fn) {
    if (p.commandTitlesAndWidths.length == 0)
        print(title.padEnd(p.directoryWidth) + " no profile data available");
    else
        print(__spreadArrays([__spreadArrays([title.padEnd(p.directoryWidth)], p.commandTitlesAndWidths.map(function (ct) { return ct.value.padStart(ct.width); })).join(' ')], p.data.map(function (pd) { return __spreadArrays([pd.directory.padEnd(p.directoryWidth)], p.commandTitlesAndWidths.map(function (cw) { return getValueToDisplay(fn, pd, cw).toString().padStart(cw.width); })).join(' '); })).map(function (s) { return s + '\n'; }).join());
}
exports.prettyPrintProfiles = prettyPrintProfiles;
