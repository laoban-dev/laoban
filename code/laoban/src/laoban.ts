import {copyTemplateDirectory, findLaoban, ProjectDetailFiles} from "./Files";
import * as fs from "fs";
import * as fse from "fs-extra";
import {abortWithReportIfAnyIssues, loadConfigOrIssues, loadLoabanJsonAndValidate} from "./configProcessor";
import {
    Action,
    Config,
    ConfigAndIssues,
    ConfigOrReportIssues,
    ProjectDetailsAndDirectory,
    ScriptDetails,
    ScriptInContext,
    ScriptInContextAndDirectory,
    ScriptInContextAndDirectoryWithoutStream
} from "./config";
import * as path from "path";
import {findProfilesFromString, loadProfile, prettyPrintProfileData, prettyPrintProfiles, ProfileAndDirectory} from "./profiling";
import {loadPackageJsonInTemplateDirectory, loadVersionFile, modifyPackageJson, saveProjectJsonFile} from "./modifyPackageJson";
import {compactStatus, DirectoryAndCompactedStatusMap, prettyPrintData, toPrettyPrintData, toStatusDetails, writeCompactedStatus} from "./status";
import * as os from "os";
import {
    execInSpawn,
    execJS,
    executeAllGenerations,
    ExecuteCommand,
    ExecuteGenerations,
    executeOneGeneration,
    ExecuteOneGeneration,
    executeScript,
    ExecuteScript,
    Generation,
    Generations,
    GenerationsResult,
    make,
    streamName,
    streamNamefn,
    timeIt
} from "./executors";
import {output, Strings} from "./utils";
import {monitor, Status} from "./monitor";
import {validateProjectDetailsAndTemplates} from "./validation";
import {AppendToFileIf, CommandDecorators, GenerationDecorators, GenerationsDecorators, ScriptDecorators} from "./decorators";
import {shellReporter} from "./report";
import {Writable} from "stream";

const displayError = (outputStream: Writable) => (e: Error) =>
    outputStream.write(e.message.split('\n').slice(0, 2).join('\n') + "\n");

const makeSessionId = (d: Date, suffix: any) => d.toISOString().replace(/:/g, '.') + '.' + suffix;

function openStream(sc: ScriptInContextAndDirectoryWithoutStream): ScriptInContextAndDirectory {
    let logStream = fs.createWriteStream(streamName(sc));
    return {...sc, logStream, streams: [logStream]}
}
function makeSc(config: Config, sessionId: string, details: ProjectDetailsAndDirectory[], script: ScriptDetails, cmd: any) {
    let status = new Status(config, dir => streamNamefn(config.sessionDir, sessionId, sc.details.name, dir))
    let allDirectorys = details.map(d => d.directory)
    let sc: ScriptInContext = {
        sessionId,
        status,
        dirWidth: Strings.maxLength(allDirectorys) - config.laobanDirectory.length,
        dryrun: cmd.dryrun, variables: cmd.variables, shell: cmd.shellDebug, quiet: cmd.quiet, links: cmd.links, throttle: cmd.throttle,
        config, details: script, timestamp: new Date(), genPlan: cmd.generationPlan,
        context: {shellDebug: cmd.shellDebug, directories: details}
    }
    return sc;
}

export class Cli {
    private executeGenerations: ExecuteGenerations;

    command(cmd: string, description: string, ...fns: ((a: any) => any)[]) {
        var p = this.program.command(cmd).description(description)
        fns.forEach(fn => p = fn(p))
        return p
    }

    defaultOptions(configAndIssues: ConfigAndIssues): (program: any) => any {
        return program => {
            let defaultThrottle = configAndIssues.config ? configAndIssues.config.throttle : 0
            return program.//
                option('-d, --dryrun', 'displays the command instead of executing it', false).//
                option('-s, --shellDebug', 'debugging around the shell', false).//
                option('-q, --quiet', "don't display the output from the commands", false).//
                option('-v, --variables', "used when debugging scripts. Shows the variables available to a command when the command is executed", false).//
                option('-1, --one', "executes in this project directory (opposite of --all)", false).//
                option('-a, --all', "executes this in all projects, even if 'ín' a project", false).//
                option('-p, --projects <projects>', "executes this in the projects matching the regex. e.g. -p 'name'", "").//
                option('-g, --generationPlan', "instead of executing shows the generation plan", false).//
                option('-t, --throttle <throttle>', "only this number of scripts will be executed in parallel", defaultThrottle).//
                option('-l, --links', "the scripts will be put into generations based on links (doesn't work properly yet if validation errors)", false)
        }
    }

    program = require('commander').//
        arguments('').//
        version('0.1.0')//


    addScripts(config: Config, options: (program: any) => any) {
        let scripts = config.scripts
        scripts.forEach(script =>
            this.command(script.name, script.description, options).//
                action((cmd: any) => this.executeCommand(cmd, config, script)))
    }

    executeCommand(cmd: any, config: Config, script: ScriptDetails): Promise<GenerationsResult> {
        if (script.osGuard) {
            if (!os.type().match(script.osGuard)) {
                console.error('os is ', os.type(), `and this command has an osGuard of  [${script.osGuard}]`)
                if (script.guardReason) console.error(script.guardReason)
                return
            }
        }
        if (script.pmGuard) {
            if (!config.packageManager.match(script.pmGuard)) {
                console.error('Package Manager is ', config.packageManager, `and this command has an pmGuard of  [${script.pmGuard}]`)
                if (script.guardReason) console.error(script.guardReason)
                return
            }
        }
        let sessionId = makeSessionId(new Date(), script.name);
        return fse.mkdirp(path.join(config.sessionDir, sessionId)).then(() =>
            ProjectDetailFiles.workOutProjectDetails(config, cmd).then(details => {
                let sc = makeSc(config, sessionId, details, script, cmd);
                let scds: Generation = details.map(d => openStream({detailsAndDirectory: d, scriptInContext: sc}))
                let gens: Generations = [scds]
                let promiseGensResult: Promise<GenerationsResult> = this.executeGenerations(gens).catch(e => {
                    config.outputStream.write('had error in execution\n')
                    displayError(config.outputStream)(e)
                    return []
                })
                monitor(sc.status, promiseGensResult.then(() => {}))
                return promiseGensResult
            }))
    }

    configAction(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<void> {
        return (cmd: any) => configOrReportIssues(configAndIssues).then(config => {
            let simpleConfig = {...config}
            delete simpleConfig.scripts
            return output(config)(JSON.stringify(simpleConfig, null, 2))
        });
    }
    runAction(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<GenerationsResult> {
        return (cmd: any) => configOrReportIssues(configAndIssues).then(config => {
            let command = this.program.args.slice(1).filter(n => !n.startsWith('-')).join(' ')
            // console.log('command.run', command)
            let s: ScriptDetails = {name: '', description: `run ${command}`, commands: [{name: 'run', command: command, status: false}]}
            return this.executeCommand(cmd, config, s)
        })
    }
    statusAction(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<void> {
        return (cmd: any) => configOrReportIssues(configAndIssues).then(config =>
            ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => {
                let compactedStatusMap: DirectoryAndCompactedStatusMap[] =
                    ds.map(d => ({directory: d.directory, compactedStatusMap: compactStatus(path.join(d.directory, config.status))}))
                let prettyPrintStatusData = toPrettyPrintData(toStatusDetails(compactedStatusMap));
                prettyPrintData(prettyPrintStatusData)
            }));
    }
    compactStatusAction(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<void> {
        return (cmd: any) =>
            configOrReportIssues(configAndIssues).then(config =>
                ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds =>
                    ds.forEach(d => writeCompactedStatus(path.join(d.directory, config.status), compactStatus(path.join(d.directory, config.status))))))
    }
    profileAction(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<void> {
        return (cmd: any) => configOrReportIssues(configAndIssues).then(config =>
            ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => Promise.all(ds.map(d =>
                loadProfile(config, d.directory).then(p => ({directory: d.directory, profile: findProfilesFromString(p)}))))).then(p => {
                let data = prettyPrintProfileData(p);
                prettyPrintProfiles(output(config), 'latest', data, p => (p.latest / 1000).toFixed(3))
                output(config)('')
                prettyPrintProfiles(output(config), 'average', data, p => (p.average / 1000).toFixed(3))
            }))
    }
    validationAction(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<void> {
        return (cmd: any) => configOrReportIssues(configAndIssues).then(config => {
            ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => validateProjectDetailsAndTemplates(config, ds)).//
                then(issues => abortWithReportIfAnyIssues(configAndIssues), displayError(config.outputStream))
            //TODO This looks like it needs a clean up. It has abort logic and display error logic.
        });
    }
    projectsAction(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<void[]> {
        return (cmd: any) => configOrReportIssues(configAndIssues).then(config =>
            ProjectDetailFiles.workOutProjectDetails(config, {}).//
                then(ds => Promise.all(ds.map(p => output(config)(p.directory)))))
    }
    updateConfigFilesFromTemplates(configOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues): Action<void> {
        return (cmd: any) =>
            configOrReportIssues(configAndIssues).then(config =>
                ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => ds.forEach(p =>
                    copyTemplateDirectory(config, p.projectDetails.template, p.directory).then(() =>
                        loadPackageJsonInTemplateDirectory(config, p.projectDetails).then(raw =>
                            loadVersionFile(config).//
                                then(version => saveProjectJsonFile(p.directory, modifyPackageJson(raw, version, p.projectDetails))))))))
    };


    constructor(configAndIssues: ConfigAndIssues, executeGenerations: ExecuteGenerations, configOrReportIssues: ConfigOrReportIssues) {
        this.executeGenerations = executeGenerations;

        let defaultOptions = this.defaultOptions(configAndIssues)

        this.command('config', 'displays the config', defaultOptions).//
            action(this.configAction(configOrReportIssues, configAndIssues))

        this.command('run', 'runs an arbitary command (the rest of the command line).', defaultOptions).//
            action(this.runAction(configOrReportIssues, configAndIssues))

        this.command('status', 'shows the status of the project in the current directory', defaultOptions).//
            action(this.statusAction(configOrReportIssues, configAndIssues))
        this.command('compactStatus', 'crunches the status', defaultOptions).//
            action(this.compactStatusAction(configOrReportIssues, configAndIssues))
        this.command('validate', 'checks the laoban.json and the project.details.json', defaultOptions).//
            action(this.validationAction(configOrReportIssues, configAndIssues))
        this.command('profile', 'shows the time taken by named steps of commands', defaultOptions).//
            action(this.profileAction(configOrReportIssues, configAndIssues))
        this.command('projects', 'lists the projects under the laoban directory', (p: any) => p).//
            action(this.projectsAction(configOrReportIssues, configAndIssues))

        this.command('updateConfigFilesFromTemplates', "overwrites the package.json based on the project.details.json, and copies other template files overwrite project's", defaultOptions).//
            action(this.updateConfigFilesFromTemplates(configOrReportIssues, configAndIssues))

        if (configAndIssues.issues.length == 0) this.addScripts(configAndIssues.config, defaultOptions)

        this.program.on('--help', () => {
            let log = output(configAndIssues)
            log('');
            log("Press ? while running for list of 'status' commands. S is the most useful")
            log('')
            log('Notes');
            log("  If you are 'in' a project (the current directory has a project.details.json') then commands are executed by default just for the current project ");
            log("     but if you are not 'in' a project, the commands are executed for all projects");
            log('  You can ask for help for a command by "laoban <cmd> --help"');
            log('');
            log('Common command options (not every command)');
            log('  -a    do it in all projects (default is to execute the command in the current project');
            log('  -d    do a dryrun and only print what would be executed, rather than executing it');
            log('')
            if (configAndIssues.issues.length > 0) {
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
                log(`There are issues preventing the program working. Type 'laoban validate' for details`)
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
            }
        });
        var p = this.program
        this.program.on('command:*',
            function () {
                output(configAndIssues)(`Invalid command: ${p.args.join(' ')}\nSee --help for a list of available commands.`);
                abortWithReportIfAnyIssues(configAndIssues)
                process.exit(1);
            }
        );
        this.program.allowUnknownOption(false);

    }


    parsed: any;
    start(argv: string[]) {
        if (process.argv.length == 2) {
            this.program.outputHelp();
            return
        }
        this.parsed = this.program.parseAsync(argv); // notice that we have to parse in a new statement.
        return this.parsed
    }
}

export function defaultExecutor(a: AppendToFileIf) { return make(execInSpawn, execJS, timeIt, CommandDecorators.normalDecorator(a))}
let appendToFiles: AppendToFileIf = (condition, name, contentGenerator) =>
    condition ? fse.appendFile(name, contentGenerator()) : Promise.resolve()

let executeOne: ExecuteCommand = defaultExecutor(appendToFiles)
let executeOneScript: ExecuteScript = ScriptDecorators.normalDecorators()(executeScript(executeOne))
let executeGeneration: ExecuteOneGeneration = GenerationDecorators.normalDecorators()(executeOneGeneration(executeOneScript))
export function executeGenerations(outputStream: Writable): ExecuteGenerations {
    return GenerationsDecorators.normalDecorators()(executeAllGenerations(executeGeneration, shellReporter(outputStream)))
}
export function makeStandardCli(outputStream: Writable) {
    let laoban = findLaoban(process.cwd())
    let configAndIssues = loadConfigOrIssues(outputStream, loadLoabanJsonAndValidate)(laoban);
    return new Cli(configAndIssues, executeGenerations(outputStream), abortWithReportIfAnyIssues);
}