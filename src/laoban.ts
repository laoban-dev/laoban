#!/usr/bin/env node
import {
    compactStatus,
    DirectoryAndCompactedStatusMap,
    Files,
    findLaoban,
    laobanFile,
    prettyPrintData,
    printStatus,
    ProjectDetailFiles,
    toPrettyPrintData,
    toStatusDetails,
    writeCompactedStatus
} from "./Files";
import * as fs from "fs";
import {configProcessor} from "./configProcessor";
import {Config, DirectoryAndResults, ProjectDetailsAndDirectory, ScriptDetails, ScriptInContext, ScriptProcessor} from "./config";
import {Strings} from "./utils";
import {consoleHandleShell, executeShellDetails, executeShellDetailsInAllDirectories, noHandleShell, shellDebugPrint} from "./shell";
import * as path from "path";


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
            option('-a, --all', 'executes this in all projects', false)
    }

    program = require('commander').//
        arguments('').//
        version('0.1.0')//

    findSortedFileNames(pds: ProjectDetailsAndDirectory[]): string[] { return this.sortProjectDetails(pds).map(pd => pd.directory) }
    findSortedFileNamesPassingGuard(script: ScriptDetails, pds: ProjectDetailsAndDirectory[]): string[] {
        // console.log('findSortedFileNamesPassingGuard', script, pds)
        let projectDetails = this.sortProjectDetails(pds)
        return (script.guard ? projectDetails.filter(pd => pd.projectDetails.projectDetails.publish == true) : projectDetails).map(pd => pd.directory);
    }
    private sortProjectDetails(pds: ProjectDetailsAndDirectory[]) {
        return pds.sort((l, r) => l.projectDetails.projectDetails.generation - r.projectDetails.projectDetails.generation);
    }
    findProjectDetailsAndDirectory(all: boolean) {return all ? this.findSortedFileNames(Files.findProjectFiles(this.config.directory)) : [process.cwd()]}
    findProjectDetailsAndDirectoryPassingGuard(all: boolean, script: ScriptDetails) {return all ? this.findSortedFileNamesPassingGuard(script, Files.findProjectFiles(this.config.directory)) : [process.cwd()]}

    addScripts(scripts: ScriptDetails[], options: (program: any) => any) {
        scripts.forEach(script => {
            this.command(script.name, script.description, options).action((cmd: any) => {
                    this.executeCommand(cmd, script);
                }
            )
        })
    }

    executeCommand(cmd: any, script: ScriptDetails) {
        if (cmd.dryrun) {
            if (cmd.all) {console.log("In every project...")}
            console.log(script.name, ":", script.description)
            console.log()
            let nameWidth = Math.max(4, Strings.maxLength(script.commands.map(s => s.name)))
            let cmdWidth = Math.max(4, Strings.maxLength(script.commands.map(s => s.command)))
            console.log('Step'.padEnd(nameWidth), 'Command')
            console.log('-'.padEnd(nameWidth, '-'), '-'.padEnd(cmdWidth, '-'))
            script.commands.forEach(c => console.log(c.name.padEnd(nameWidth), c.command))
        } else {
            ProjectDetailFiles.findAndLoadSortedProjectDetails(laoban, cmd.all, () => true).then(details => {
                let sc: ScriptInContext = {
                    config: this.config, details: script, timestamp: new Date(),
                    context: {shellDebug: cmd.shellDebug, directories: details}
                }
                let results: Promise<DirectoryAndResults[]> = this.scriptProcessor(sc)
                let processor = cmd.quiet ? noHandleShell : (cmd.shellDebug ? shellDebugPrint : consoleHandleShell)
                return results.then(processor, processor)
            })
        }
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
                let s: ScriptDetails = {
                    name: 'run', description: `run ${command}`, commands: [
                        {name: 'run', command: command, status: false}
                    ]
                }
                this.executeCommand(cmd, s)
            })

        this.command('status', 'shows the status of the project in the current directory', this.defaultOptions).//
            action((cmd: any) => {
                let compactedStatusMap: DirectoryAndCompactedStatusMap[] = this.findProjectDetailsAndDirectory(cmd.all).map(d => ({
                    directory: d,
                    compactedStatusMap: compactStatus(path.join(d, this.config.status))
                }))
                let prettyPrintStatusData = toPrettyPrintData(toStatusDetails(compactedStatusMap));
                prettyPrintData(prettyPrintStatusData)
            })
        this.command('compactStatus', 'crunches the status', this.defaultOptions).//
            action((cmd: any) => {
                this.findProjectDetailsAndDirectory(cmd.all).forEach(d => writeCompactedStatus(path.join(d, this.config.status), compactStatus(path.join(d, this.config.status))))
            })
        this.command('projects', 'lists the projects under the laoban directory', (p: any) => p).//
            action((cmd: any) => this.sortProjectDetails(Files.findProjectFiles(config.directory)).forEach(p => console.log(p)))
        this.addScripts(config.scripts, this.defaultOptions)

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