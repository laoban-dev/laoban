"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitor = exports.monitorCommandDecorator = exports.monitorScriptDecorator = exports.monitorGenerationDecorator = exports.Status = void 0;
var readline = require("readline");
var fs = require("fs");
var ch = '0123456789abcdefghijklmnopqrstuvwxyz';
var Status = /** @class */ (function () {
    function Status(config, directoryToLogName) {
        this.generations = [];
        this.gen = -1;
        this.config = config, this.directoryToLogName = directoryToLogName;
    }
    Status.prototype.genStatus = function () { return this.generations[this.gen]; };
    Status.prototype.dirStatus = function (dir) { return this.genStatus().directories.get(dir); };
    Status.prototype.generationStart = function () {
        this.gen = this.gen + 1;
        this.generations[this.gen] = { directories: new Map() };
    };
    Status.prototype.scriptStart = function (directory) {
        var status = this.genStatus();
        status.directories.set(directory, { commands: [], finished: false });
    };
    Status.prototype.scriptEnd = function (directory) {
        var status = this.dirStatus(directory);
        status.finished = true;
    };
    Status.prototype.commandStart = function (directory, command) {
        var status = this.dirStatus(directory);
        status.commands.push({ name: command, startTime: new Date() });
    };
    Status.prototype.commandFinished = function (directory, command) {
        var status = this.dirStatus(directory);
        status.commands[status.commands.length - 1].endTime = new Date();
    };
    Status.prototype.commandStatusString = function (s) {
        var now = new Date();
        function duration(s) { return Math.round(((s.endTime ? s.endTime : now).getTime() - s.startTime.getTime()) / 1000); }
        return s.map(function (s) { return s.name + "(" + duration(s) + ")"; }).join(', ');
    };
    Status.prototype.dumpStatus = function () {
        var _this = this;
        console.clear();
        this.generations.forEach(function (gen, geni) {
            console.log("generation", geni);
            __spreadArrays(gen.directories.keys()).sort().forEach(function (dir, i) {
                var status = gen.directories.get(dir);
                console.log('  ', _this.getPrefix(geni, i), dir + (status.finished ? ' finished' : ''));
                console.log('    ', _this.commandStatusString(status.commands));
            });
        });
    };
    Status.prototype.logStatus = function () {
        var _this = this;
        console.clear();
        this.generations.forEach(function (gen, geni) {
            console.log("generation", geni);
            __spreadArrays(gen.directories.keys()).sort().forEach(function (dir, i) {
                var status = gen.directories.get(dir);
                console.log('  ' + _this.getPrefix(geni, i), _this.directoryToLogName(dir) + (status.finished ? ' finished' : ''));
            });
        });
    };
    Status.prototype.getPrefix = function (geni, i) {
        return geni == this.gen ? "(" + i + ")" : '';
    };
    Status.prototype.help = function () {
        console.log('Welcome to the status screen for Laoban');
        console.log('   Press ? for this help');
        console.log('   Press (capital) S for overall status');
        console.log('   Press (capital) L for information about where the logs are');
        console.log('   Press a number or letter to get the tail of the log file which has that number or letter in the status');
        var directories = this.genStatus().directories;
        __spreadArrays(directories.keys()).sort().forEach(function (dir, i) { return console.log('       ', ch.charAt(i), 'tail of the log for ', dir); });
    };
    Status.prototype.tailLog = function (index) {
        console.clear();
        var gen = this.genStatus();
        var directories = gen.directories;
        var keys = __spreadArrays(directories.keys()).sort();
        var dir = keys[index];
        if (dir) {
            var status_1 = gen.directories.get(dir);
            console.log(dir + (status_1.finished ? ' finished' : ''));
            console.log('  ', this.commandStatusString(status_1.commands));
            console.log();
            console.log(this.directoryToLogName(dir));
            console.log(''.padStart(this.directoryToLogName(dir).length, '-'));
            fs.readFile(this.directoryToLogName(dir), function (err, data) {
                if (err)
                    console.error(err);
                var slicedText = data.toString().split('\n').slice(-10).join('\n');
                console.log(slicedText);
            });
        }
        else {
            console.log('cannot find tail of', index);
            console.log();
            this.help();
        }
    };
    return Status;
}());
exports.Status = Status;
exports.monitorGenerationDecorator = function (e) { return function (d) {
    if (d.length > 0) {
        var status_2 = d[0].scriptInContext.status;
        status_2.generationStart();
    }
    return e(d);
}; };
exports.monitorScriptDecorator = function (e) { return function (d) {
    var status = d.scriptInContext.status;
    var directory = d.detailsAndDirectory.directory;
    status.scriptStart(directory);
    return e(d).then(function (r) {
        status.scriptEnd(directory);
        return r;
    });
}; };
exports.monitorCommandDecorator = function (e) { return function (d) {
    var status = d.scriptInContext.status;
    var directory = d.detailsAndDirectory.directory;
    var command = d.details.commandString;
    status.commandStart(directory, command);
    return e(d).then(function (r) {
        status.commandFinished(directory, command);
        return r;
    });
}; };
function monitor(status) {
    if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('keypress', function (str, key) {
            try {
                switch (str) {
                    case '?':
                        console.clear();
                        status.help();
                        break;
                    case 'S':
                        console.clear();
                        status.dumpStatus();
                        break;
                    case 'L':
                        console.clear();
                        status.logStatus();
                        break;
                }
                var index = ch.indexOf(str);
                if (index >= 0) {
                    status.tailLog(index);
                }
                if (key.sequence == '\x03') {
                    process.kill(process.pid, 'SIGINT');
                }
            }
            catch (e) {
                console.clear();
                console.error('unexpected error. Press ? for help');
                console.error();
                console.error(e);
            }
        });
    }
}
exports.monitor = monitor;
