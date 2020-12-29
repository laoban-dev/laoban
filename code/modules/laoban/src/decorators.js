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
exports.CommandDecorators = exports.GenerationsDecorators = exports.GenerationDecorators = exports.ScriptDecorators = void 0;
var configProcessor_1 = require("./configProcessor");
var path = require("path");
var utils_1 = require("./utils");
var generations_1 = require("./generations");
var fs = require("fs");
var monitor_1 = require("./monitor");
var shouldAppend = function (d) { return !d.scriptInContext.dryrun; };
var dryRunContents = function (d) {
    var trim = trimmedDirectory(d.scriptInContext);
    return trim(d.details.directory).padEnd(d.scriptInContext.dirWidth) + " " + d.details.commandString;
};
function calculateVariableText(d) {
    var dic = d.details.dic;
    var simplerdic = __assign({}, dic);
    delete simplerdic.scripts;
    return ["Raw command is [" + d.details.command.command + "] became [" + d.details.commandString + "]", "legal variables are",
        JSON.stringify(simplerdic, null, 2)].join("\n") + "\n";
}
function trimmedDirectory(sc) {
    return function (dir) { return dir.substring(sc.config.laobanDirectory.length + 1); };
}
var ScriptDecorators = /** @class */ (function () {
    function ScriptDecorators() {
    }
    ScriptDecorators.normalDecorators = function () {
        return utils_1.chain([this.shellDecoratorForScript, monitor_1.monitorScriptDecorator]);
    };
    ScriptDecorators.shellDecoratorForScript = function (e) { return function (scd) {
        if (scd.scriptInContext.shell && !scd.scriptInContext.dryrun)
            utils_1.writeTo(scd.streams, '*' + scd.detailsAndDirectory.directory + '\n');
        return e(scd);
    }; };
    return ScriptDecorators;
}());
exports.ScriptDecorators = ScriptDecorators;
var GenerationDecorators = /** @class */ (function () {
    function GenerationDecorators() {
    }
    GenerationDecorators.normalDecorators = function () {
        return monitor_1.monitorGenerationDecorator;
    };
    return GenerationDecorators;
}());
exports.GenerationDecorators = GenerationDecorators;
var GenerationsDecorators = /** @class */ (function () {
    function GenerationsDecorators() {
    }
    GenerationsDecorators.normalDecorators = function () {
        return utils_1.chain([this.PlanDecorator, this.ThrottlePlanDecorator, this.LinkPlanDecorator].map(this.applyTemplate));
    };
    GenerationsDecorators.PlanDecorator = {
        name: 'plan',
        condition: function (scd) { return scd.genPlan; },
        transform: function (sc, gens) {
            var trim = trimmedDirectory(sc);
            function log() {
                var s = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    s[_i] = arguments[_i];
                }
                return utils_1.output(sc.config)(s.join(' ') + "\n");
            }
            if (sc.dryrun) {
                gens.forEach(function (gen, i) {
                    log("Generation", i);
                    gen.forEach(function (scd) {
                        if (scd.scriptInContext.details.commands.length == 1)
                            log('   ', trim(scd.detailsAndDirectory.directory), scd.scriptInContext.details.commands[0].command);
                        else {
                            log('   ', trim(scd.detailsAndDirectory.directory));
                            scd.scriptInContext.details.commands.forEach(function (c) { return log('       ', c.command); });
                        }
                    });
                });
            }
            else
                gens.forEach(function (gen, i) { return log("Generation", i, gen.map(function (scd) { return trim(scd.detailsAndDirectory.directory); }).join(", ")); });
            return [];
        }
    };
    GenerationsDecorators.ThrottlePlanDecorator = {
        name: 'throttle',
        condition: function (scd) { return scd.throttle > 0; },
        transform: function (scd, gens) { return utils_1.flatten(gens.map(function (gen) { return utils_1.partition(gen, scd.throttle); })); }
    };
    GenerationsDecorators.LinkPlanDecorator = {
        name: 'links',
        condition: function (scd) { return scd.links || scd.details.inLinksOrder; },
        transform: function (scd, g) { return utils_1.flatten(g.map(generations_1.splitGenerationsByLinks)); }
    };
    GenerationsDecorators.applyTemplate = function (t) { return function (e) { return function (gens) {
        if (gens.length > 0 && gens[0].length > 0) {
            var scd_1 = gens[0][0].scriptInContext;
            var s = scd_1.debug('scripts');
            s.message(function () { return ['applying GenerationsDecoratorTemplates', 'generationTemplate', t.name, 'generations', gens.length, 'condition', t.condition(scd_1)]; });
            if (t.condition(scd_1)) {
                return e(t.transform(scd_1, gens));
            }
        }
        return e(gens);
    }; }; };
    return GenerationsDecorators;
}());
exports.GenerationsDecorators = GenerationsDecorators;
var CommandDecorators = /** @class */ (function () {
    function CommandDecorators() {
    }
    CommandDecorators.normalDecorator = function (a) {
        return utils_1.chain(__spreadArrays([CommandDecorators.guard, CommandDecorators.pmGuard, CommandDecorators.osGuard].map(CommandDecorators.guardDecorate), [
            CommandDecorators.dryRun,
            CommandDecorators.log,
            monitor_1.monitorCommandDecorator
        ], [CommandDecorators.status, CommandDecorators.profile].map(CommandDecorators.fileDecorate(a)), [CommandDecorators.variablesDisplay, CommandDecorators.shellDisplay].map(CommandDecorators.stdOutDecorator)));
    };
    CommandDecorators.fileDecorate = function (appendIf) { return function (dec) { return function (e) {
        return function (d) { return e(d).then(function (res) { return Promise.all(res.map(function (r) { return appendIf(dec.appendCondition(d) && shouldAppend(d), dec.filename(d), function () { return dec.content(d, r); }); })).then(function () { return res; }); }); };
    }; }; };
    CommandDecorators.status = {
        appendCondition: function (d) { return d.details.command.status; },
        filename: function (d) { return path.join(d.detailsAndDirectory.directory, d.scriptInContext.config.status); },
        content: function (d, res) { return d.scriptInContext.timestamp.toISOString() + " " + (res.err === null) + " " + d.details.command.name + "\n"; }
    };
    CommandDecorators.profile = {
        appendCondition: function (d) { return d.details.command.name; },
        filename: function (d) { return path.join(d.detailsAndDirectory.directory, d.scriptInContext.config.profile); },
        content: function (d, res) { return d.scriptInContext.details.name + " " + d.details.command.name + " " + res.duration + "\n"; }
    };
    CommandDecorators.log = function (e) { return function (d) {
        var log = path.join(d.detailsAndDirectory.directory, d.scriptInContext.config.log);
        var logStream = fs.createWriteStream(log, { flags: 'a' });
        logStream.write(d.scriptInContext.timestamp.toISOString() + " " + d.details.commandString + "\n");
        var newD = __assign(__assign({}, d), { streams: __spreadArrays(d.streams, [logStream]) });
        return e(newD).then(function (sr) {
            sr.forEach(function (res) { return logStream.write("Took " + res.duration + (res.err ? ", Error was [" + res.err + "]" : '') + "\n"); });
            return sr;
        });
    }; };
    CommandDecorators.dryRun = function (e) { return function (d) {
        if (d.scriptInContext.dryrun) {
            var value = dryRunContents(d);
            utils_1.writeTo(d.streams, value + '\n');
            return Promise.resolve([{ duration: 0, details: d, stdout: value, err: null, stderr: "" }]);
        }
        else
            return e(d);
    }; };
    CommandDecorators.stdOutDecorator = function (dec) { return function (e) { return function (d) {
        if (dec.condition(d)) {
            utils_1.writeTo(d.streams, dec.pretext(d));
            return e(d).then(function (sr) { return sr.map(function (r) {
                utils_1.writeTo(r.details.streams, dec.posttext(d, r));
                return r;
            }); });
        }
        else
            return e(d);
    }; }; };
    CommandDecorators.shellDisplay = {
        condition: function (d) { return d.scriptInContext.shell && !d.scriptInContext.dryrun; },
        pretext: function (d) { return '*   ' + d.details.commandString + '\n'; },
        transform: function (sr) { return sr; },
        posttext: function (d, sr) { return ''; }
    };
    CommandDecorators.variablesDisplay = {
        condition: function (d) { return d.scriptInContext.variables; },
        pretext: function (d) { return calculateVariableText(d); },
        transform: function (sr) { return sr; },
        posttext: function (d, sr) { return ''; }
    };
    // static quietDisplay: CommandDecorator = e => d =>//TODO Do we still need this
    //     d.scriptInContext.quiet ? e(d).then(sr => sr.map(r => ({...r, stdout: ''}))) : e(d)
    CommandDecorators.guardDecorate = function (dec) { return function (e) {
        return function (d) {
            var s = d.scriptInContext.debug('scripts');
            var guard = dec.guard(d);
            return (guard === undefined || dec.valid(guard, d)) ? e(d) : s.k(function () { return "Script killed by guard " + dec.name; }, function () { return Promise.resolve([]); });
        };
    }; };
    CommandDecorators.guard = {
        name: 'guard',
        guard: function (d) { return d.scriptInContext.details.guard; },
        valid: function (g, d) { return configProcessor_1.derefenceToUndefined(d.details.dic, g) != ''; }
    };
    CommandDecorators.osGuard = {
        name: 'osGuard',
        guard: function (d) { return d.details.command.osGuard; },
        valid: function (g, d) { return g === d.scriptInContext.config.os; }
    };
    CommandDecorators.pmGuard = {
        name: 'pmGuard',
        guard: function (d) { return d.details.command.pmGuard; },
        valid: function (g, d) { return g === d.scriptInContext.config.packageManager; }
    };
    return CommandDecorators;
}());
exports.CommandDecorators = CommandDecorators;
