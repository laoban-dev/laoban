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
Object.defineProperty(exports, "__esModule", { value: true });
exports.configProcessor = exports.cleanUpEnv = exports.cleanUpCommand = exports.derefenceToUndefined = exports.replaceVarToUndefined = exports.derefence = exports.loadConfigOrIssues = exports.abortWithReportIfAnyIssues = exports.loadLoabanJsonAndValidate = void 0;
var path = require("path");
var Files_1 = require("./Files");
var os = require("os");
var fs_1 = require("fs");
// @ts-ignore
var validation_1 = require("@phil-rice/validation");
var validation_2 = require("./validation");
var utils_1 = require("./utils");
function loadLoabanJsonAndValidate(laobanDirectory) {
    var laobanConfigFileName = Files_1.laobanFile(laobanDirectory);
    try {
        var rawConfig = JSON.parse(fs_1.default.readFileSync(laobanConfigFileName).toString());
        var issues = validation_2.validateLaobanJson(validation_1.Validate.validate("In directory " + path.parse(laobanDirectory).name + ", " + Files_1.loabanConfigName, rawConfig)).errors;
        return { rawConfig: rawConfig, issues: issues };
    }
    catch (e) {
        return { issues: ["Could not load laoban.json"] };
    }
}
exports.loadLoabanJsonAndValidate = loadLoabanJsonAndValidate;
exports.abortWithReportIfAnyIssues = function (configAndIssues) {
    var issues = configAndIssues.issues;
    var log = utils_1.output(configAndIssues);
    if (issues.length > 0) {
        log('Validation errors prevent loaban from running correctly');
        issues.forEach(function (e) { return log('  ' + e); });
        process.exit(2);
    }
    else
        return Promise.resolve(__assign({}, configAndIssues.config));
};
function loadConfigOrIssues(outputStream, fn) {
    return function (laoban) {
        var _a = loadLoabanJsonAndValidate(laoban), rawConfig = _a.rawConfig, issues = _a.issues;
        return { issues: issues, outputStream: outputStream, config: issues.length > 0 ? undefined : configProcessor(laoban, outputStream, rawConfig) };
    };
}
exports.loadConfigOrIssues = loadConfigOrIssues;
/** ref is like ${xxx} and this returns dic[xxx]. If the variable doesn't exist it is left alone... */
function replaceVar(dic, ref) {
    if (ref === undefined)
        return undefined;
    var i = ref.slice(2, ref.length - 1);
    var parts = i.split('.');
    try {
        var result = parts.reduce(function (acc, part) { return acc[part]; }, dic);
        return result !== undefined ? result : ref;
    }
    catch (e) {
        return ref;
    }
}
/** If the string has ${a} in it, then that is replaced by the dic entry */
function derefence(dic, s) {
    var regex = /(\$\{[^}]*\})/g;
    var groups = s.match(regex);
    return groups ? groups.reduce(function (acc, v) { return acc.replace(v, replaceVar(dic, v)); }, s) : s;
}
exports.derefence = derefence;
function replaceVarToUndefined(dic, ref) {
    if (ref === undefined)
        return undefined;
    var i = ref.slice(2, ref.length - 1);
    var parts = i.split('.');
    try {
        return parts.reduce(function (acc, part) { return acc[part]; }, dic);
    }
    catch (e) {
        return undefined;
    }
}
exports.replaceVarToUndefined = replaceVarToUndefined;
function derefenceToUndefined(dic, s) {
    var regex = /(\$\{[^}]*\})/g;
    var groups = s.match(regex);
    if (groups) {
        return groups.reduce(function (acc, v) {
            var repl = replaceVarToUndefined(dic, v);
            return acc.replace(v, repl ? repl : "");
        }, s);
    }
    return undefined;
}
exports.derefenceToUndefined = derefenceToUndefined;
function isCommand(x) {
    return typeof x === 'object';
}
function cleanUpCommand(command) {
    return isCommand(command) ?
        (__assign(__assign({}, command), { command: command.command })) :
        ({ name: '', command: command });
}
exports.cleanUpCommand = cleanUpCommand;
function cleanUpEnv(dic, env) {
    if (env) {
        var result_1 = {};
        Object.keys(env).forEach(function (key) { return result_1[key] = derefence(dic, env[key].toString()); });
        return result_1;
    }
    return env;
}
exports.cleanUpEnv = cleanUpEnv;
function cleanUpScript(dic) {
    return function (scriptName, defn) { return ({
        name: derefence(dic, scriptName),
        description: derefence(dic, defn.description),
        guard: defn.guard,
        osGuard: defn.osGuard,
        pmGuard: defn.pmGuard,
        guardReason: defn.guardReason,
        inLinksOrder: defn.inLinksOrder,
        commands: defn.commands.map(cleanUpCommand),
        env: cleanUpEnv(dic, defn.env)
    }); };
}
function addScripts(dic, scripts) {
    var result = [];
    for (var scriptName in scripts)
        result.push(cleanUpScript(dic)(scriptName, scripts[scriptName]));
    return result;
}
function configProcessor(laoban, outputStream, rawConfig) {
    var result = { laobanDirectory: laoban, outputStream: outputStream, laobanConfig: path.join(laoban, Files_1.loabanConfigName) };
    function add(name, raw) {
        result[name] = derefence(result, raw[name]);
    }
    add("templateDir", rawConfig);
    add("versionFile", rawConfig);
    add("log", rawConfig);
    add("status", rawConfig);
    add("profile", rawConfig);
    add("packageManager", rawConfig);
    result.sessionDir = rawConfig.sessionDir ? rawConfig.sessionDir : path.join(laoban, '.session');
    result.throttle = rawConfig.throttle ? rawConfig.throttle : 0;
    for (var k in rawConfig.variables)
        add(k, rawConfig.variables);
    result.scripts = addScripts(result, rawConfig.scripts);
    result.os = os.type();
    return result;
}
exports.configProcessor = configProcessor;
