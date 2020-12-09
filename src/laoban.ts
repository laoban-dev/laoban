#!/usr/bin/env node
import {copyTemplateDirectory, findLaoban, laobanFile, ProjectDetailFiles} from "./Files";
import * as fs from "fs";
import * as fse from "fs-extra";
import {configProcessor} from "./configProcessor";
import {Config, ScriptDetails, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import * as path from "path";
import {findProfilesFromString, loadProfile, prettyPrintProfileData, prettyPrintProfiles, ProfileAndDirectory} from "./profiling";
import {loadPackageJsonInTemplateDirectory, loadVersionFile, modifyPackageJson, saveProjectJsonFile} from "./modifyPackageJson";
import {compactStatus, DirectoryAndCompactedStatusMap, prettyPrintData, toPrettyPrintData, toStatusDetails, writeCompactedStatus} from "./status";
import * as os from "os";
import {reportValidation, validateConfigOnHardDrive, validateLaobanJson} from "./validation";
import {
    AppendToFileIf,
    consoleOutputFor,
    defaultExecutor,
    executeAllGenerations,
    ExecuteGenerations,
    ExecuteOne,
    ExecuteOneGeneration,
    executeOneGeneration,
    ExecuteOneScript,
    executeScript,
    Generation,
    GenerationResult,
    Generations,
    GenerationsDecorators, ScriptDecorators, ScriptResult, ShellResult, streamName
} from "./executors";
import {Strings} from "./utils";
import {createWriteStream} from "fs";
import {log} from "util";

function makeSessionId(d: Date, clashAvoider: any) {
    return [d.getFullYear(), (d.getMonth() + 1), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), clashAvoider].join('.')
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
            option('-l, --links', "the scripts will be put into generations based on links (doesn't work properly yet)", false)
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
        let sessionId = makeSessionId(new Date(), Math.random().toPrecision(3));
        fse.mkdirp(path.join(this.config.sessionDir, sessionId)).then(() => {
            ProjectDetailFiles.workOutProjectDetails(laoban, cmd).then(details => {
                let allDirectorys = details.map(d => d.directory)
                let dirWidth = Strings.maxLength(allDirectorys) - laoban.length
                let sc: ScriptInContext = {
                    sessionId: sessionId,
                    dirWidth: dirWidth,
                    dryrun: cmd.dryrun, variables: cmd.variables, shell: cmd.shellDebug, quiet: cmd.quiet,
                    links: cmd.links,
                    config: this.config, details: script, timestamp: new Date(), genPlan: cmd.generationPlan,
                    throttle: cmd.throttle,
                    context: {shellDebug: cmd.shellDebug, directories: details}
                }
                let scds: Generation = details.map(d => ({
                    detailsAndDirectory: d,
                    scriptInContext: sc,
                    logStream: fs.createWriteStream(streamName(this.config.sessionDir, sessionId, d.directory))
                }))
                let gens: Generations = [scds]
                // console.log('here goes nothing-0')
                // scds.forEach(summariseCommandDetails)
                return this.executeGenerations(gens).catch(e => {
                    console.error('had error in execution')
                    console.error(e)
                })
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
                console.log(laoban, JSON.stringify(simpleConfig, null, 2))
            })
        this.command('run', 'runs an arbitary command (the rest of the command line).', this.defaultOptions).//
            action((cmd: any) => {
                let command = this.program.args.slice(0).filter(n => !n.startsWith('-')).join(' ')
                // console.log(command)
                let s: ScriptDetails = {name: '', description: `run ${command}`, commands: [{name: 'run', command: command, status: false}]}
                this.executeCommand(cmd, s)
            })

        this.command('status', 'shows the status of the project in the current directory', this.defaultOptions).//
            action((cmd: any) => {
                ProjectDetailFiles.workOutProjectDetails(laoban, cmd).then(ds => {
                    let compactedStatusMap: DirectoryAndCompactedStatusMap[] = ds.map(d =>
                        ({directory: d.directory, compactedStatusMap: compactStatus(path.join(d.directory, this.config.status))}))
                    let prettyPrintStatusData = toPrettyPrintData(toStatusDetails(compactedStatusMap));
                    prettyPrintData(prettyPrintStatusData)
                })
            })
        this.command('compactStatus', 'crunches the status', this.defaultOptions).//
            action((cmd: any) => {
                ProjectDetailFiles.workOutProjectDetails(laoban, cmd).then(ds => {
                    ds.forEach(d => writeCompactedStatus(path.join(d.directory, this.config.status), compactStatus(path.join(d.directory, this.config.status))))
                })
            })
        this.command('validate', 'checks the laoban.json and the project.details.json', this.defaultOptions).//
            action((cmd: any) => {
                ProjectDetailFiles.workOutProjectDetails(laoban, cmd).then(ds => validateConfigOnHardDrive(this.config, ds)).//
                    then(v => reportValidation(v)).catch(e => console.error(e.message))
            })
        // this.command('generations', 'wip: calculating generations', this.defaultOptions).//
        //     action((cmd: any) => {
        //         ProjectDetailFiles.workOutProjectDetails(laoban, cmd).then(ds => prettyPrintGenerations(ds), calcAllGeneration(ds.map(d => d.projectDetails), {
        //             existing: [],
        //             generations: []
        //         })))
        //     })
        this.command('profile', 'shows the time taken by named steps of commands', this.defaultOptions).//
            action((cmd: any) => {
                let x: Promise<ProfileAndDirectory[]> = ProjectDetailFiles.workOutProjectDetails(laoban, cmd).then(ds => Promise.all(ds.map(d =>
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
                ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, true).then(ds => ds.forEach(p => console.log(p.directory))))
        this.command('updateConfigFilesFromTemplates', "overwrites the package.json based on the project.details.json, and copies other template files overwrite project's", this.defaultOptions).//
            action((cmd: any) =>
                ProjectDetailFiles.workOutProjectDetails(laoban, cmd).then(ds => ds.forEach(p =>
                    copyTemplateDirectory(config, p.projectDetails.template, p.directory).then(() =>
                        loadPackageJsonInTemplateDirectory(config, p.projectDetails).then(raw =>
                            loadVersionFile(config).then(version => saveProjectJsonFile(p.directory, modifyPackageJson(raw, version, p.projectDetails))))))))


        this.addScripts(config.scripts, this.defaultOptions)
        this.program.on('--help', () => {
            console.log('');
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

let laoban = findLaoban(process.cwd())
let rawConfig = JSON.parse(fs.readFileSync(laobanFile(laoban)).toString())
let issues = validateLaobanJson(rawConfig);
if (issues.length > 0) {
    issues.forEach(e => console.error(e))
    process.exit(2)
}

function reporter(gen: GenerationResult, enrich: (sr: ScriptResult[], text: string) => string) {
    Promise.all(gen.map((sr, i) => {
        let logFile = streamName(sr.scd.scriptInContext.config.sessionDir, sr.scd.scriptInContext.sessionId, sr.scd.detailsAndDirectory.directory);
        return new Promise<string>((resolve, reject) => {
            sr.scd.logStream.on('finish', () => resolve(logFile))
        })
    })).then(fileNames => fileNames.map(logFile => {
        let text = fse.readFileSync(logFile).toString()
        console.log(enrich(gen, text))
    }))
    gen.forEach(sr => sr.scd.logStream.end())
}

function shellReporter(gen: GenerationResult) {
    if (gen.length > 0) {
        let scd: ScriptInContextAndDirectory = gen[0].scd;
        if (scd.scriptInContext.shell && !scd.scriptInContext.dryrun) {
            gen.forEach((sr, i) => {
                console.log(sr.scd.detailsAndDirectory.directory)
                sr.results.forEach((r, i) => {
                    console.log('   ', r.details.details.commandString, r.details.details.directory.substring(sr.scd.detailsAndDirectory.directory.length))
                    let out = consoleOutputFor(r);
                    if (out.length > 0) {console.log(Strings.indentEachLine('        ', out))}
                })
            })

        } else reporter(gen, (sr,text) => text)
    }
}

let config = configProcessor(laoban, rawConfig)
let appendToFiles: AppendToFileIf = (condition, name, contentGenerator) => {
    if (condition) return fse.appendFile(name, contentGenerator())
    else return Promise.resolve();
}
let executeOne: ExecuteOne = defaultExecutor(appendToFiles)
let executeOneScript: ExecuteOneScript = ScriptDecorators.normalDecorators()(executeScript(executeOne))
let executeGeneration: ExecuteOneGeneration = executeOneGeneration(executeOneScript)
let executeGenerations: ExecuteGenerations = GenerationsDecorators.normalDecorators()(executeAllGenerations(executeGeneration, shellReporter))

let cli = new Cli(config, executeGenerations);

cli.start(process.argv)