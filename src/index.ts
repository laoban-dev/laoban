#!/usr/bin/env node
import {copyTemplateDirectory, findLaoban, laobanFile, ProjectDetailFiles} from "./Files";
import * as fs from "fs";
import * as fse from "fs-extra";
import {configProcessor} from "./configProcessor";
import {Config, ScriptDetails, ScriptInContext, ScriptInContextAndDirectory, ScriptInContextAndDirectoryWithoutStream} from "./config";
import * as path from "path";
import {findProfilesFromString, loadProfile, prettyPrintProfileData, prettyPrintProfiles, ProfileAndDirectory} from "./profiling";
import {loadPackageJsonInTemplateDirectory, loadVersionFile, modifyPackageJson, saveProjectJsonFile} from "./modifyPackageJson";
import {compactStatus, DirectoryAndCompactedStatusMap, prettyPrintData, toPrettyPrintData, toStatusDetails, writeCompactedStatus} from "./status";
import * as os from "os";
import {reportValidation, validateConfigOnHardDrive, validateLaobanJson} from "./validation";
import {
    execInSpawn,
    execJS,
    executeAllGenerations,
    ExecuteCommand,
    ExecuteGenerations,
    ExecuteOneGeneration,
    executeOneGeneration,
    ExecuteScript,
    executeScript,
    Generation,
    Generations, GenerationsResult,
    make,
    streamName, streamNamefn,
    timeIt
} from "./executors";
import {Strings} from "./utils";
import {AppendToFileIf, CommandDecorators, GenerationDecorators, GenerationsDecorators, ScriptDecorators} from "./decorators";
import {shellReporter} from "./report";
import * as readline from "readline";
import {monitor, Status} from "./monitor";

const makeSessionId = (d: Date, suffix: any) => d.toISOString().replace(/:/g, '.') + '.' + suffix;

function openStream(sc: ScriptInContextAndDirectoryWithoutStream): ScriptInContextAndDirectory {
    let logStream = fs.createWriteStream(streamName(sc));
    return {...sc, logStream, streams: [logStream]}
}
export class Cli {
    private executeGenerations: ExecuteGenerations;
    private config: Config;

    command(cmd: string, description: string, ...fns: ((a: any) => any)[]) {
        var p = this.program.command(cmd).description(description)
        fns.forEach(fn => p = fn(p))
        return p
    }

    defaultOptions(program: any): any {
        return program.//
            option('-d, --dryrun', 'displays the command instead of executing it', false).//
            option('-s, --shellDebug', 'debugging around the shell', false).//
            option('-q, --quiet', "don't display the output from the commands", false).//
            option('-v, --variables', "used when debugging scripts. Shows the variables available to a command when the command is executed", false).//
            option('-1, --one', "executes in this project directory (opposite of --all)", false).//
            option('-a, --all', "executes this in all projects, even if 'ín' a project", false).//
            option('-p, --projects <projects>', "executes this in the projects matching the regex. e.g. -p 'name'", "").//
            option('-g, --generationPlan', "instead of executing shows the generation plan", false).//
            option('-t, --throttle <throttle>', "only this number of scripts will be executed in parallel", config.throttle).//
            option('-l, --links', "the scripts will be put into generations based on links (doesn't work properly yet if validation errors)", false)
    }

    program = require('commander').//
        arguments('').//
        version('0.1.0')//


    addScripts(scripts: ScriptDetails[], options: (program: any) => any) {
        scripts.forEach(script => {
            this.command(script.name, script.description, options).action((cmd: any) => {
                    this.executeCommand(cmd, script);
                }
            )
        })
    }

    executeCommand(cmd: any, script: ScriptDetails) {
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
        fse.mkdirp(path.join(this.config.sessionDir, sessionId)).then(() => {
            ProjectDetailFiles.workOutProjectDetails(index, cmd).then(details => {
                let allDirectorys = details.map(d => d.directory)
                let dirWidth = Strings.maxLength(allDirectorys) - index.length
                let status = new Status(this.config, dir => streamNamefn(this.config.sessionDir, sessionId, sc.details.name, dir))
                let sc: ScriptInContext = {
                    sessionId,
                    status,
                    dirWidth,
                    dryrun: cmd.dryrun, variables: cmd.variables, shell: cmd.shellDebug, quiet: cmd.quiet,
                    links: cmd.links,
                    config: this.config, details: script, timestamp: new Date(), genPlan: cmd.generationPlan,
                    throttle: cmd.throttle,
                    context: {shellDebug: cmd.shellDebug, directories: details}
                }
                let scds: Generation = details.map(d => openStream({
                    detailsAndDirectory: d,
                    scriptInContext: sc
                }))
                let gens: Generations = [scds]
                let promises = this.executeGenerations(gens).catch(e => {
                    console.error('had error in execution')
                    console.error(e)
                    throw e
                });
                monitor(status, promises.then(() => {}))
                return promises
            })
        }).catch(e => console.error('Could not execute because', e))
    }
    constructor(config: Config, executeGenerations: ExecuteGenerations) {
        this.executeGenerations = executeGenerations;
        this.config = config
        this.command('config', 'displays the config', this.defaultOptions).//
            action((cmd: any) => {
                let simpleConfig = {...config}
                delete simpleConfig.scripts
                console.log(index, JSON.stringify(simpleConfig, null, 2))
            })
        this.command('run', 'runs an arbitary command (the rest of the command line).', this.defaultOptions).//
            action((cmd: any) => {
                let command = this.program.args.slice(0).filter(n => !n.startsWith('-')).join(' ')
                let s: ScriptDetails = {name: '', description: `run ${command}`, commands: [{name: 'run', command: command, status: false}]}
                this.executeCommand(cmd, s)
            })

        this.command('status', 'shows the status of the project in the current directory', this.defaultOptions).//
            action((cmd: any) => {
                ProjectDetailFiles.workOutProjectDetails(index, cmd).then(ds => {
                    let compactedStatusMap: DirectoryAndCompactedStatusMap[] = ds.map(d =>
                        ({directory: d.directory, compactedStatusMap: compactStatus(path.join(d.directory, this.config.status))}))
                    let prettyPrintStatusData = toPrettyPrintData(toStatusDetails(compactedStatusMap));
                    prettyPrintData(prettyPrintStatusData)
                })
            })
        this.command('compactStatus', 'crunches the status', this.defaultOptions).//
            action((cmd: any) => {
                ProjectDetailFiles.workOutProjectDetails(index, cmd).then(ds => {
                    ds.forEach(d => writeCompactedStatus(path.join(d.directory, this.config.status), compactStatus(path.join(d.directory, this.config.status))))
                })
            })
        this.command('validate', 'checks the laoban.json and the project.details.json', this.defaultOptions).//
            action((cmd: any) => {
                ProjectDetailFiles.workOutProjectDetails(index, cmd).then(ds => validateConfigOnHardDrive(this.config, ds)).//
                    then(v => reportValidation(v)).catch(e => console.error(e.message))
            })
        this.command('profile', 'shows the time taken by named steps of commands', this.defaultOptions).//
            action((cmd: any) => {
                let x: Promise<ProfileAndDirectory[]> = ProjectDetailFiles.workOutProjectDetails(index, cmd).then(ds => Promise.all(ds.map(d =>
                    loadProfile(this.config, d.directory).then(p => ({directory: d.directory, profile: findProfilesFromString(p)})))))
                x.then(p => {
                    let data = prettyPrintProfileData(p);
                    prettyPrintProfiles('latest', data, p => (p.latest / 1000).toFixed(3))
                    console.log()
                    prettyPrintProfiles('average', data, p => (p.average / 1000).toFixed(3))
                })
            })
        this.command('projects', 'lists the projects under the laoban directory', (p: any) => p).//
            action((cmd: any) =>
                ProjectDetailFiles.findAndLoadSortedProjectDetails(index, true).then(ds => ds.forEach(p => console.log(p.directory))))
        this.command('updateConfigFilesFromTemplates', "overwrites the package.json based on the project.details.json, and copies other template files overwrite project's", this.defaultOptions).//
            action((cmd: any) =>
                ProjectDetailFiles.workOutProjectDetails(index, cmd).then(ds => ds.forEach(p =>
                    copyTemplateDirectory(config, p.projectDetails.template, p.directory).then(() =>
                        loadPackageJsonInTemplateDirectory(config, p.projectDetails).then(raw =>
                            loadVersionFile(config).then(version => saveProjectJsonFile(p.directory, modifyPackageJson(raw, version, p.projectDetails))))))))
        this.addScripts(config.scripts, this.defaultOptions)
        this.program.on('--help', () => {
            console.log('');
            console.log("Press ? while running for list of 'status' commands. S is the most useful")
            console.log()
            console.log('Notes');
            console.log("  If you are 'in' a project (the current directory has a project.details.json') then commands are executed by default just for the current project ");
            console.log("     but if you are not 'in' a project, the commands are executed for all projects");
            console.log('  You can ask for help for a command by "laoban <cmd> --help"');
            console.log('');
            console.log('Common command options (not every command)');
            console.log('  -a    do it in all projects (default is to execute the command in the current project');
            console.log('  -d    do a dryrun and only print what would be executed, rather than executing it');
        });
        var p = this.program
        this.program.on('command:*',
            function () {
                console.error('Invalid command: %s\nSee --help for a list of available commands.', p.args.join(' '));
                process.exit(1);
            }
        );
        this.program.allowUnknownOption(false);

    }
    parsed: any;
    start(argv: string[]) {
        if (process.argv.length == 2) {
            this.program.outputHelp();
            process.exit(2)
        }
        this.parsed = this.program.parse(argv); // notice that we have to parse in a new statement.
    }
}

let index = findLaoban(process.cwd())
let rawConfig = JSON.parse(fs.readFileSync(laobanFile(index)).toString())
let issues = validateLaobanJson(rawConfig);
if (issues.length > 0) {
    issues.forEach(e => console.error(e))
    process.exit(2)
}

export function defaultExecutor(a: AppendToFileIf) { return make(execInSpawn, execJS, timeIt, CommandDecorators.normalDecorator(a))}

let config = configProcessor(index, rawConfig)
let appendToFiles: AppendToFileIf = (condition, name, contentGenerator) =>
    condition ? fse.appendFile(name, contentGenerator()) : Promise.resolve()

let executeOne: ExecuteCommand = defaultExecutor(appendToFiles)
let executeOneScript: ExecuteScript = ScriptDecorators.normalDecorators()(executeScript(executeOne))
let executeGeneration: ExecuteOneGeneration = GenerationDecorators.normalDecorators()(executeOneGeneration(executeOneScript))
let executeGenerations: ExecuteGenerations = GenerationsDecorators.normalDecorators()(executeAllGenerations(executeGeneration, shellReporter))

let cli = new Cli(config, executeGenerations);

cli.start(process.argv)
