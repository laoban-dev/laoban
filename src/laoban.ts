#!/usr/bin/env node
import {compactStatus, Files, findLaoban, laobanFile, printStatus, writeCompactedStatus} from "./Files";
import * as fs from "fs";
import {configProcessor} from "./configProcessor";
import {Config, DirectoryAndResults, ScriptDetails, ScriptInContext, ScriptProcessor} from "./config";
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

    makeDirectories(all: boolean) {return all ? Files.findProjectFiles(this.config.directory) : [process.cwd()]}
    addScripts(scripts: ScriptDetails[], options: (program: any) => any) {
        scripts.forEach(script => {
            this.command(script.name, script.description, options).action((cmd: any) => {
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
                        let sc: ScriptInContext = {
                            config: this.config, details: script, timestamp: new Date(),
                            context: {shellDebug: cmd.shellDebug, directories: this.makeDirectories(cmd.all)}
                        }
                        let results: Promise<DirectoryAndResults[]> = this.scriptProcessor(sc)
                        let processor = cmd.quiet? noHandleShell: (cmd.shellDebug ? shellDebugPrint : consoleHandleShell)
                        results.then(processor, processor)
                    }
                }
            )
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
        this.command('status', 'shows the status of the project in the current directory', this.defaultOptions).//
            action((cmd: any) => {
                this.makeDirectories(cmd.all).forEach(d => printStatus(d, compactStatus(path.join(d, this.config.status))))
            })
        this.command('compactStatus', 'crunches the status', this.defaultOptions).//
            action((cmd: any) => {
                this.makeDirectories(cmd.all).forEach(d => writeCompactedStatus(path.join(d, this.config.status), compactStatus(path.join(d, this.config.status))))
            })
        this.command('projects', 'lists the projects under the laoban directory', (p: any) => p).//
            action((cmd: any) => Files.findProjectFiles(config.directory).forEach(p => console.log(p)))
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
let config = JSON.parse(fs.readFileSync(laobanFile(laoban)).toString())

// function allProjectScriptProcessor(context: CommandContext, c: Config, s: ScriptDetails): Promise<ShellResult[]> {
//     return Promise.all(Files.findProjectFiles(c.directory).map(fd => {
//         let command = `cd ${fd}\n` + s.commands.map(s => s.command).join("\n")
//         return executeShell(context.shellDebug, "Project Directory: " + fd, command, path.join(fd, c.projectLog));
//     }))
// }
// function projectScriptProcessor(context: CommandContext, c: Config, s: ScriptDetails): Promise<ShellResult[]> {
//     return context.all ? allProjectScriptProcessor(context, c, s) : globalScriptProcessor(context, c, s)
// }
// function globalScriptProcessor(context: CommandContext, c: Config, s: ScriptDetails): Promise<ShellResult[]> {
//     let command = s.commands.map(s => s.command).join("\n")
//     let result = executeShell(context.shellDebug, "Directory: " + process.cwd(), command, c.globalLog);
//     return Promise.all([result])
// }

//
// let scriptProcessor: ScriptProcessorMap = new Map()
// scriptProcessor.set('project', projectScriptProcessor)
// scriptProcessor.set('global', globalScriptProcessor)

let cli = new Cli(configProcessor(laoban, config), executeShellDetailsInAllDirectories);

cli.start(process.argv)