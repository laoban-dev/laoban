#!/usr/bin/env node
import {compactStatus, DirectoryAndCompactedStatusMap, findLaoban, laobanFile, prettyPrintData, ProjectDetailFiles, toPrettyPrintData, toStatusDetails, writeCompactedStatus} from "./Files";
import * as fs from "fs";
import {configProcessor} from "./configProcessor";
import {Config, DirectoryAndResults, ScriptDetails, ScriptInContext, ScriptProcessor} from "./config";
import {consoleHandleShell, executeShellDetailsInAllDirectories, noHandleShell, shellDebugPrint} from "./shell";
import * as path from "path";
import {findProfilesFromString, loadProfile, prettyPrintProfileData, prettyPrintProfiles, Profile, ProfileAndDirectory} from "./profiling";
import {Profiler} from "inspector";
import {loadTemplateFile, loadVersionFile, modifyPackageJson, saveProjectJsonFile} from "./modifyPackageJson";


export class Cli {
    private scriptProcessor: ScriptProcessor;
    private config: Config;

    command(cmd: string, description: string, ...fns: ((a: any) => any)[]) {
        var p = this.program.command(cmd).description(description)
        fns.forEach(fn => p = fn(p))
        return p
    }

    defaultOptions(program: any): any {
        return program.option('-d, --dryrun', 'displays the command instead of executing it', false).//
            option('-s, --shellDebug', 'debugging around the shell', false).//
            option('-q, --quiet', "don't display the output from the commands", false).//
            option('-v, --variables', "used when debugging scripts. Shows the variables available to a command when the command is executed", false).//
            option('-a, --all', 'executes this in all projects', false)
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
        ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, cmd.all).then(details => {
            let sc: ScriptInContext = {
                dryrun: cmd.dryrun, variables: cmd.variables,
                config: this.config, details: script, timestamp: new Date(),
                context: {shellDebug: cmd.shellDebug, directories: details}
            }
            let results: Promise<DirectoryAndResults[]> = this.scriptProcessor(sc)
            let processor = cmd.quiet ? noHandleShell : (cmd.shellDebug ? shellDebugPrint : consoleHandleShell)
            return results.then(processor, processor)
        })
    }
    constructor(config: Config, scriptProcessor: ScriptProcessor) {
        this.scriptProcessor = scriptProcessor;
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
                ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, cmd.all).then(ds => {
                    let compactedStatusMap: DirectoryAndCompactedStatusMap[] = ds.map(d =>
                        ({directory: d.directory, compactedStatusMap: compactStatus(path.join(d.directory, this.config.status))}))
                    let prettyPrintStatusData = toPrettyPrintData(toStatusDetails(compactedStatusMap));
                    prettyPrintData(prettyPrintStatusData)
                })
            })
        this.command('compactStatus', 'crunches the status', this.defaultOptions).//
            action((cmd: any) => {
                ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, cmd.all).then(ds => {
                    ds.forEach(d => writeCompactedStatus(path.join(d.directory, this.config.status), compactStatus(path.join(d.directory, this.config.status))))
                })
            })
        this.command('profile', 'shows the time taken by named steps of commands', this.defaultOptions).//
            action((cmd: any) => {
                let x: Promise<ProfileAndDirectory[]> = ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, cmd.all).then(ds => Promise.all(ds.map(d =>
                    loadProfile(this.config, d.directory).then(p => ({directory: d.directory, profile: findProfilesFromString(p)})))))
                x.then(p => {
                    let data = prettyPrintProfileData(p);
                    prettyPrintProfiles('latest', data, p => (p.latest / 1000).toPrecision(3))
                    console.log()
                    prettyPrintProfiles('average', data, p => (p.average / 1000).toPrecision(3))
                })
            })
        this.command('projects', 'lists the projects under the laoban directory', (p: any) => p).//
            action((cmd: any) =>
                ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, true).then(ds => ds.forEach(p => console.log(p.directory))))
        this.command('updatePackageJson', 'overwrites the package.json based on the project.details.json', this.defaultOptions).//
            action((cmd: any) =>
                ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, cmd.all).then(ds => ds.forEach(p =>
                    loadTemplateFile(config, p.projectDetails).then(raw =>
                        loadVersionFile(config).then(version => saveProjectJsonFile(p.directory, modifyPackageJson(raw, version, p.projectDetails)))))))
         this.addScripts(config.scripts, this.defaultOptions)
        this.program.on('--help', () => {
            console.log('');
            console.log('Notes');
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


let config = configProcessor(laoban, rawConfig);
let cli = new Cli(config, executeShellDetailsInAllDirectories);

cli.start(process.argv)