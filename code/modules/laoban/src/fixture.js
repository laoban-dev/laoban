"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dirsIn = exports.toArrayReplacingRoot = exports.executeCli = exports.execute = exports.pwd = exports.fullPathsOfTestDirs = exports.testRoot = void 0;
var path_1 = require("path");
var fs_1 = require("fs");
var cp = require("child_process");
var Files_1 = require("./Files");
var os_1 = require("os");
var laoban_1 = require("./laoban");
var stream_1 = require("stream");
exports.testRoot = path_1.default.resolve(Files_1.findLaoban(process.cwd()), '..', 'tests');
exports.fullPathsOfTestDirs = function () { return dirsIn('test').map(function (d) { return path_1.default.resolve(d); }); };
exports.pwd = os_1.default.type() == 'Windows' ? 'echo %CD%' : 'pwd';
function execute(cwd, cmd) {
    // console.log('execute', cwd, cmd)
    return new Promise(function (resolve) {
        cp.exec(cmd, { cwd: cwd }, function (error, stdout, stdErr) {
            resolve((stdout.toString() + "\n" + stdErr).toString());
        });
    });
}
exports.execute = execute;
function rememberWritable(data) {
    return new stream_1.Writable({
        write: function (chunk, encoding, callback) {
            data.push(chunk);
            callback();
        }
    });
}
function executeCli(cwd, cmd) {
    var data = [];
    var stream = rememberWritable(data);
    var args = __spreadArrays(process.argv.slice(0, 2), cmd.split(' ').slice(1));
    return executeInChangedDirectory(cwd, function () { return laoban_1.makeStandardCli(stream).start(args).then(function () { return data.join(''); }); });
}
exports.executeCli = executeCli;
function executeInChangedDirectory(cwd, fn) {
    var start = process.cwd();
    process.chdir(cwd);
    return fn().then(function (res) {
        // console.log('res is', res, process.cwd())
        process.chdir(start);
        return res;
    });
}
function streamToString(stream) {
    var chunks = [];
    return new Promise(function (resolve, reject) {
        stream.on('data', function (chunk) { return chunks.push(chunk); });
        stream.on('error', reject);
        stream.on('end', function () { return resolve(Buffer.concat(chunks).toString('utf8')); });
    });
}
function toArrayReplacingRoot(s) {
    var rootMatch = new RegExp(exports.testRoot, "g");
    return s.split('\n').map(function (s) { return s.trim(); }).map(function (s) { return s.replace(rootMatch, "<root>"); }).filter(function (s) { return s.length > 0; });
}
exports.toArrayReplacingRoot = toArrayReplacingRoot;
function dirsIn(root) {
    return fs_1.default.readdirSync(root). //
        map(function (testDirName) { return path_1.default.join(exports.testRoot, testDirName); }). //
        filter(function (d) { return fs_1.default.statSync(d).isDirectory(); }). //
        map(function (testDir) { return path_1.default.relative(exports.testRoot, testDir); });
}
exports.dirsIn = dirsIn;
