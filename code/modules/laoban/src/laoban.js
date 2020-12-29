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
exports.makeStandardCli = exports.executeGenerations = exports.defaultExecutor = exports.Cli = void 0;
var Files_1 = require("./Files");
var fs = require("fs");
var fse = require("fs-extra");
var configProcessor_1 = require("./configProcessor");
var path = require("path");
var profiling_1 = require("./profiling");
var modifyPackageJson_1 = require("./modifyPackageJson");
var status_1 = require("./status");
var os = require("os");
var executors_1 = require("./executors");
var utils_1 = require("./utils");
var monitor_1 = require("./monitor");
var validation_1 = require("./validation");
var decorators_1 = require("./decorators");
var report_1 = require("./report");
// @ts-ignore
var debug_1 = require("@phil-rice/debug");
var displayError = function (outputStream) { return function (e) { outputStream.write(e.message.split('\n').slice(0, 2).join('\n') + "\n"); }; };
var makeSessionId = function (d, suffix) { return d.toISOString().replace(/:/g, '.') + '.' + suffix; };
function openStream(sc) {
    var logStream = fs.createWriteStream(executors_1.streamName(sc));
    return __assign(__assign({}, sc), { logStream: logStream, streams: [logStream] });
}
function makeSc(config, status, sessionId, details, script, cmd) {
    var sc = {
        debug: config.debug,
        sessionId: sessionId,
        status: status,
        dirWidth: utils_1.Strings.maxLength(details.map(function (d) { return d.directory; })) - config.laobanDirectory.length,
        dryrun: cmd.dryrun, variables: cmd.variables, shell: cmd.shellDebug, quiet: cmd.quiet, links: cmd.links, throttle: cmd.throttle,
        config: config,
        details: script, timestamp: new Date(), genPlan: cmd.generationPlan,
        context: { shellDebug: cmd.shellDebug, directories: details }
    };
    return sc;
}
function checkGuard(config, script) {
    var s = config.debug('scripts');
    s.message(function () { return ['osGuard', os.type(), script.osGuard, 'pmGuard', config.packageManager, script.pmGuard]; });
    var makeErrorPromise = function (error) { return Promise.reject(script.guardReason ? error + "\n" + script.guardReason : error); };
    if (script.osGuard && !os.type().match(script.osGuard))
        return makeErrorPromise("os is  " + os.type() + ", and this command has an osGuard of  [" + script.osGuard + "]");
    if (script.pmGuard && !config.packageManager.match(script.pmGuard))
        return makeErrorPromise("Package Manager is " + config.packageManager + " and this command has an pmGuard of  [" + script.pmGuard + "]");
    return Promise.resolve();
}
var configAction = function (config, cmd) {
    var simpleConfig = __assign({}, config);
    delete simpleConfig.scripts;
    delete simpleConfig.outputStream;
    return Promise.resolve(utils_1.output(config)(JSON.stringify(simpleConfig, null, 2)));
};
//TODO sort out type signature.. and it's just messy
function runAction(executeCommand, command, executeGenerations) {
    return function (config, cmd) {
        // console.log('runAction', command())
        var s = { name: '', description: "run " + command, commands: [{ name: 'run', command: command(), status: false }] };
        // console.log('command.run', command)
        return executeCommand(config, s, executeGenerations)(config, cmd);
    };
}
var statusAction = function (config, cmd, pds) {
    var compactedStatusMap = pds.map(function (d) { return ({ directory: d.directory, compactedStatusMap: status_1.compactStatus(path.join(d.directory, config.status)) }); });
    var prettyPrintStatusData = status_1.toPrettyPrintData(status_1.toStatusDetails(compactedStatusMap));
    status_1.prettyPrintData(prettyPrintStatusData);
    return Promise.resolve();
};
var compactStatusAction = function (config, cmd, pds) {
    return Promise.all(pds.map(function (d) {
        return status_1.writeCompactedStatus(path.join(d.directory, config.status), status_1.compactStatus(path.join(d.directory, config.status)));
    }));
};
var profileAction = function (config, cmd, pds) {
    return Promise.all(pds.map(function (d) { return profiling_1.loadProfile(config, d.directory).then(function (p) { return ({ directory: d.directory, profile: profiling_1.findProfilesFromString(p) }); }); })). //
        then(function (p) {
        var data = profiling_1.prettyPrintProfileData(p);
        profiling_1.prettyPrintProfiles(utils_1.output(config), 'latest', data, function (p) { return (p.latest / 1000).toFixed(3); });
        utils_1.output(config)('');
        profiling_1.prettyPrintProfiles(utils_1.output(config), 'average', data, function (p) { return (p.average / 1000).toFixed(3); });
    });
};
var validationAction = function (config, cmd) { return Files_1.ProjectDetailFiles.workOutProjectDetails(config, cmd). //
    then(function (ds) { return validation_1.validateProjectDetailsAndTemplates(config, ds); }). //
    then(function (issues) { return configProcessor_1.abortWithReportIfAnyIssues({ config: config, outputStream: config.outputStream, issues: issues }); }, displayError(config.outputStream)); };
//TODO This looks like it needs a clean up. It has abort logic and display error logic.
var projectsAction = function (config, cmd) {
    return Files_1.ProjectDetailFiles.workOutProjectDetails(config, __assign(__assign({}, cmd), { all: true })). //
        then(function (pds) {
        var width = utils_1.Strings.maxLength(pds.map(function (p) { return p.directory; }));
        pds.forEach(function (p) { return utils_1.output(config)(p.directory.padEnd(width) + " => " + p.projectDetails.name); });
    }). //
        catch(displayError(config.outputStream));
};
var updateConfigFilesFromTemplates = function (config, cmd, pds) {
    var d = config.debug('update');
    return Promise.all(pds.map(function (p) {
        return d.k(function () { return 'copyTemplateDirectory'; }, function () { return Files_1.copyTemplateDirectory(config, p.projectDetails.template, p.directory).then(function () {
            d.k(function () { return 'loadPackageJson'; }, function () { return modifyPackageJson_1.loadPackageJsonInTemplateDirectory(config, p.projectDetails); }).then(function (raw) {
                return d.k(function () { return 'loadVersionFile'; }, function () { return modifyPackageJson_1.loadVersionFile(config); }). //
                    then(function (version) { return d.k(function () { return 'saveProjectJsonFile'; }, function () { return modifyPackageJson_1.saveProjectJsonFile(p.directory, modifyPackageJson_1.modifyPackageJson(raw, version, p.projectDetails)); }); });
            });
        }); });
    }));
};
// function command<T>(p: commander.CconfigOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues) => (cmd: string,a: Action<T>, description: string, ...fns: ((a: any) => any)[]) {
//     function action<T>(a: Action<T>): (cmd: any) => Promise<T> {
//         return cmd => configOrReportIssues(configAndIssues).then(config => a(config, cmd))
//     }
//     var p = this.program.command(cmd).description(description)
//     fns.forEach(fn => p = fn(p))
//     return p.action(action(a))
// }
var Cli = /** @class */ (function () {
    function Cli(configAndIssues, executeGenerations, configOrReportIssues) {
        var program = require('commander'). //
            arguments(''). //
            version('0.1.0'); //
        var defaultOptions = this.defaultOptions(configAndIssues);
        function command(program, cmd, description, fns) {
            var p = program.command(cmd).description(description);
            fns.forEach(function (fn) { return p = fn(p); });
            return p;
        }
        function action(p, name, a, description) {
            var options = [];
            for (var _i = 4; _i < arguments.length; _i++) {
                options[_i - 4] = arguments[_i];
            }
            return command(p, name, description, options). //
                action(function (cmd) {
                return configOrReportIssues(configAndIssues).then(debug_1.addDebug(cmd.debug, function (x) { return console.log.apply(console, __spreadArrays(['#'], x)); })).then(function (configWithDebug) {
                    return a(configWithDebug, cmd). //
                        catch(displayError(configWithDebug.outputStream));
                });
            });
        }
        function projectAction(p, name, a, description) {
            var options = [];
            for (var _i = 4; _i < arguments.length; _i++) {
                options[_i - 4] = arguments[_i];
            }
            return action.apply(void 0, __spreadArrays([p, name, function (config, cmd) {
                    return Files_1.ProjectDetailFiles.workOutProjectDetails(config, cmd). //
                        then(function (pds) { return a(config, cmd, pds); }). //
                        catch(displayError(config.outputStream));
                }, description], options));
        }
        function scriptAction(p, name, description, scriptFn, fn) {
            var options = [];
            for (var _i = 5; _i < arguments.length; _i++) {
                options[_i - 5] = arguments[_i];
            }
            return projectAction.apply(void 0, __spreadArrays([p, name, function (config, cmd, pds) {
                    var script = scriptFn();
                    var status = new monitor_1.Status(config, function (dir) { return executors_1.streamNamefn(config.sessionDir, sessionId, script.name, dir); });
                    var sessionId = cmd.sessionId ? cmd.sessionId : makeSessionId(new Date(), script.name);
                    var sessionDir = path.join(config.sessionDir, sessionId);
                    config.debug('session').message(function () { return ['sessionId', sessionId, 'sessionDir', sessionDir]; });
                    return checkGuard(config, script).then(function () { return fse.mkdirp(sessionDir).then(function () {
                        monitor_1.monitor(status);
                        var scds = pds.map(function (d) { return openStream({ detailsAndDirectory: d, scriptInContext: makeSc(config, status, sessionId, pds, script, cmd) }); });
                        var s = config.debug('scripts');
                        s.message(function () { return __spreadArrays(['rawScriptCommands'], script.commands.map(function (s) { return s.command; })); });
                        s.message(function () { return __spreadArrays(['directories'], scds.map(function (s) { return s.detailsAndDirectory.directory; })); });
                        return fn([scds]);
                    }); });
                }, description], options));
        }
        action(program, 'config', configAction, 'displays the config', this.minimalOptions(configAndIssues));
        action(program, 'validate', validationAction, 'checks the laoban.json and the project.details.json', defaultOptions);
        scriptAction(program, 'run', 'runs an arbitary command (the rest of the command line).', function () { return ({
            name: 'run', description: 'runs an arbitary command (the rest of the command line).',
            commands: [{ name: 'run', command: program.args.slice(1).filter(function (n) { return !n.startsWith('-'); }).join(' '), status: false }]
        }); }, executeGenerations, defaultOptions);
        projectAction(program, 'status', statusAction, 'shows the status of the project in the current directory', defaultOptions);
        projectAction(program, 'compactStatus', compactStatusAction, 'crunches the status', defaultOptions);
        projectAction(program, 'profile', profileAction, 'shows the time taken by named steps of commands', defaultOptions);
        action(program, 'projects', projectsAction, 'lists the projects under the laoban directory', this.minimalOptions(configAndIssues));
        projectAction(program, 'update', updateConfigFilesFromTemplates, "overwrites the package.json based on the project.details.json, and copies other template files overwrite project's", defaultOptions);
        if (configAndIssues.issues.length == 0)
            configAndIssues.config.scripts.forEach(function (script) { return scriptAction(program, script.name, script.description, function () { return script; }, executeGenerations, defaultOptions); });
        program.on('--help', function () {
            var log = utils_1.output(configAndIssues);
            log('');
            log("Press ? while running for list of 'status' commands. S is the most useful");
            log('');
            log('Notes');
            log("  If you are 'in' a project (the current directory has a project.details.json') then commands are executed by default just for the current project ");
            log("     but if you are not 'in' a project, the commands are executed for all projects");
            log('  You can ask for help for a command by "laoban <cmd> --help"');
            log('');
            log('Common command options (not every command)');
            log('  -a    do it in all projects (default is to execute the command in the current project');
            log('  -d    do a dryrun and only print what would be executed, rather than executing it');
            log('');
            if (configAndIssues.issues.length > 0) {
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                log("There are issues preventing the program working. Type 'laoban validate' for details");
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
            }
        });
        program.on('command:*', function () {
            utils_1.output(configAndIssues)("Invalid command: " + this.program.args.join(' ') + "\nSee --help for a list of available commands.");
            configProcessor_1.abortWithReportIfAnyIssues(configAndIssues);
            process.exit(1);
        });
        program.allowUnknownOption(false);
        this.program = program;
    }
    Cli.prototype.defaultOptions = function (configAndIssues) {
        return function (program) {
            var defaultThrottle = configAndIssues.config ? configAndIssues.config.throttle : 0;
            return program. //
                option('-d, --dryrun', 'displays the command instead of executing it', false). //
                option('-s, --shellDebug', 'debugging around the shell', false). //
                option('-q, --quiet', "don't display the output from the commands", false). //
                option('-v, --variables', "used when debugging scripts. Shows the variables available to a command when the command is executed", false). //
                option('-1, --one', "executes in this project directory (opposite of --all)", false). //
                option('-a, --all', "executes this in all projects, even if 'ín' a project", false). //
                option('-p, --projects <projects>', "executes this in the projects matching the regex. e.g. -p 'name'", ""). //
                option('-g, --generationPlan', "instead of executing shows the generation plan", false). //
                option('-t, --throttle <throttle>', "only this number of scripts will be executed in parallel", defaultThrottle.toString()). //
                option('-l, --links', "the scripts will be put into generations based on links (doesn't work properly yet if validation errors)", false). //
                option('--debug <debug>', "enables debugging. debug is a comma separated list.legal values include [session,update,link]"). //
                option('--sessionId <sessionId>', "specifies the session id, which is mainly used for logging");
        };
    };
    Cli.prototype.minimalOptions = function (configAndIssues) {
        return function (program) { return program. //
            option('--debug <debug>', "enables debugging. debug is a comma separated list.legal values include [session,update,link]"); };
    };
    Cli.prototype.start = function (argv) {
        // console.log('starting', argv)
        if (argv.length == 2) {
            this.program.outputHelp();
            return Promise.resolve();
        }
        this.parsed = this.program.parseAsync(argv); // notice that we have to parse in a new statement.
        return this.parsed;
    };
    return Cli;
}());
exports.Cli = Cli;
function defaultExecutor(a) { return executors_1.make(executors_1.execInSpawn, executors_1.execJS, executors_1.timeIt, decorators_1.CommandDecorators.normalDecorator(a)); }
exports.defaultExecutor = defaultExecutor;
var appendToFiles = function (condition, name, contentGenerator) {
    return condition ? fse.appendFile(name, contentGenerator()) : Promise.resolve();
};
var executeOne = defaultExecutor(appendToFiles);
var executeOneScript = decorators_1.ScriptDecorators.normalDecorators()(executors_1.executeScript(executeOne));
var executeGeneration = decorators_1.GenerationDecorators.normalDecorators()(executors_1.executeOneGeneration(executeOneScript));
function executeGenerations(outputStream) {
    return decorators_1.GenerationsDecorators.normalDecorators()(executors_1.executeAllGenerations(executeGeneration, report_1.shellReporter(outputStream)));
}
exports.executeGenerations = executeGenerations;
function makeStandardCli(outputStream) {
    var laoban = Files_1.findLaoban(process.cwd());
    var configAndIssues = configProcessor_1.loadConfigOrIssues(outputStream, configProcessor_1.loadLoabanJsonAndValidate)(laoban);
    return new Cli(configAndIssues, executeGenerations(outputStream), configProcessor_1.abortWithReportIfAnyIssues);
}
exports.makeStandardCli = makeStandardCli;
