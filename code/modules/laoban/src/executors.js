"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execJS = exports.execInSpawn = exports.make = exports.timeIt = exports.executeScript = exports.executeAllGenerations = exports.executeOneGeneration = exports.buildShellCommandDetails = exports.streamName = exports.streamNamefn = void 0;
var cp = require("child_process");
var configProcessor_1 = require("./configProcessor");
var path = require("path");
var utils_1 = require("./utils");
function calculateDirectory(directory, command) { return (command.directory) ? path.join(directory, command.directory) : directory; }
function streamNamefn(sessionDir, sessionId, scriptName, directory) {
    return path.join(sessionDir, sessionId, directory.replace(/\//g, '_')) + '.' + scriptName + '.log';
}
exports.streamNamefn = streamNamefn;
function streamName(scd) {
    return streamNamefn(scd.scriptInContext.config.sessionDir, scd.scriptInContext.sessionId, scd.scriptInContext.details.name, scd.detailsAndDirectory.directory);
}
exports.streamName = streamName;
function buildShellCommandDetails(scd) {
    return utils_1.flatten(scd.scriptInContext.details.commands.map(function (cmd) {
        var directory = calculateDirectory(scd.detailsAndDirectory.directory, cmd);
        function makeShellDetails(link) {
            var dic = __assign(__assign({}, scd.scriptInContext.config), { projectDirectory: scd.detailsAndDirectory.directory, projectDetails: scd.detailsAndDirectory.projectDetails, link: link });
            var env = configProcessor_1.cleanUpEnv(dic, scd.scriptInContext.details.env);
            var resultForOneCommand = __assign(__assign({}, scd), { details: ({
                    command: cmd,
                    commandString: configProcessor_1.derefence(dic, cmd.command),
                    dic: dic,
                    env: env,
                    directory: configProcessor_1.derefence(dic, directory),
                }) });
            return resultForOneCommand;
        }
        var rawlinks = scd.detailsAndDirectory.projectDetails.details.links;
        var links = rawlinks ? rawlinks : [];
        // console.log('links are', links)
        return cmd.eachLink ? links.map(makeShellDetails) : [makeShellDetails()];
    }));
}
exports.buildShellCommandDetails = buildShellCommandDetails;
exports.executeOneGeneration = function (e) { return function (gen) { return Promise.all(gen.map(function (x) { return e(x); })); }; };
function executeAllGenerations(executeOne, reporter) {
    var fn = function (gs, sofar) {
        if (gs.length == 0)
            return Promise.resolve(sofar);
        return executeOne(gs[0]).then(function (gen0Res) {
            return reporter(gen0Res).then(function () { return fn(gs.slice(1), __spreadArrays(sofar, [gen0Res])); });
        });
    };
    return function (gs) { return fn(gs, []); };
}
exports.executeAllGenerations = executeAllGenerations;
exports.executeScript = function (e) { return function (scd) {
    var s = scd.scriptInContext.debug('scripts');
    s.message(function () { return ["execute script"]; });
    var startTime = new Date().getTime();
    return executeOneAfterTheOther(e)(buildShellCommandDetails(scd)).then(function (results) { return ({ results: [].concat.apply([], results), scd: scd, duration: new Date().getTime() - startTime }); });
}; };
function executeOneAfterTheOther(fn) {
    return function (froms) { return froms.reduce(function (res, f) { return res.then(function (r) { return fn(f).then(function (to) { return __spreadArrays(r, [to]); }); }); }, Promise.resolve([])); };
}
function jsOrShellFinder(js, shell) {
    return function (c) { return (c.details.commandString.startsWith('js:')) ? js : shell; };
}
function timeIt(e) {
    return function (d) {
        var startTime = new Date();
        return e(d).then(function (res) { return [__assign(__assign({}, res), { details: d, duration: (new Date().getTime() - startTime.getTime()) })]; });
    };
}
exports.timeIt = timeIt;
function make(shell, js, timeIt) {
    var decorators = [];
    for (var _i = 3; _i < arguments.length; _i++) {
        decorators[_i - 3] = arguments[_i];
    }
    var decorate = utils_1.chain(decorators);
    var decoratedShell = decorate(timeIt(shell));
    var decoratedJs = decorate(timeIt(js));
    var finder = jsOrShellFinder(decoratedJs, decoratedShell);
    return function (c) {
        var s = c.scriptInContext.debug('scripts');
        return s.k(function () { return "executing " + c.details.commandString + " in " + c.detailsAndDirectory.directory; }, function () { return finder(c)(c); });
    };
}
exports.make = make;
exports.execInSpawn = function (d) {
    // console.log('in execInSpawn', d.details)
    var options = d.details.env ? { cwd: d.details.directory, env: __assign(__assign({}, process.env), d.details.env) } : { cwd: d.details.directory };
    return new Promise(function (resolve, reject) {
        //TODO refactor this so that the catch is just for the spawn
        try {
            var debug = d.scriptInContext.debug('scripts');
            debug.message(function () { return ["spawning " + d.details.commandString + ". Options are " + JSON.stringify(__assign(__assign({}, options), { shell: true }))]; });
            var child = cp.spawn(d.details.commandString, __assign(__assign({}, options), { shell: true }));
            child.stdout.on('data', function (data) { return utils_1.writeTo(d.streams, data); }); //Why not pipe? because the lifecycle of the streams are different
            child.stderr.on('data', function (data) { return utils_1.writeTo(d.streams, data); });
            child.on('close', function (code) { resolve({ err: code == 0 ? null : code }); });
        }
        catch (e) {
            console.error(e);
            reject(Error("Error while trying to execute " + d.details.commandString + " in " + d.detailsAndDirectory.directory + "\n\nError is " + e));
        }
    });
};
//** The function passed in should probably not return a promise. The directory is changed, the function executed and then the directory is changed back
function executeInChangedDir(dir, block) {
    var oldDir = process.cwd();
    try {
        process.chdir(dir);
        return block();
    }
    finally {
        process.chdir(oldDir);
    }
}
//** The function passed in should probably not return a promise. The env is changed, the function executed and then the env changed back
function executeInChangedEnv(env, block) {
    var oldEnv = process.env;
    try {
        if (env)
            process.env = env;
        return block();
    }
    finally {
        process.env = oldEnv;
    }
}
exports.execJS = function (d) {
    // console.log('in execJs',process.cwd(),d.details.directory, d.details.commandString)
    try {
        var res = executeInChangedEnv(d.details.env, function () { return executeInChangedDir(d.details.directory, function () { return Function("return  " + d.details.commandString.substring(3))().toString(); }); });
        var result = res.toString();
        utils_1.writeTo(d.streams, result + '\n');
        return Promise.resolve({ err: null });
    }
    catch (e) {
        var result = "Error: " + e + " Command was [" + d.details.commandString + "]";
        utils_1.writeTo(d.streams, result + '\n');
        return Promise.resolve({ err: e });
    }
};
