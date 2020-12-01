#!/usr/bin/env node
import {Files, findLaoban, laobanFile} from "./Files";
import * as fs from "fs";
import {configProcessor} from "./configProcessor";
import {CommandContext, Config, ScriptDetails, ScriptProcessorMap} from "./config";
import {Strings} from "./utils";
import {consoleHandleShell, executeShell, ShellResult} from "./shell";


export class Cli {
    private scriptProcessor: ScriptProcessorMap;
    private config: Config;

    command(cmd: string, description: string, ...fns: ((a: any) => any)[]) {
        var p = this.program.command(cmd).description(description)
        fns.forEach(fn => p = fn(p))
        return p
    }

    defaultOptions(program: any): any {
        return program.option('-d, --dryrun', 'displays the command instead of executing it', false).//
            option('-s, --shellDebug', 'debugging around the shell', false)
    }
    projectOptions(program: any): any {
        return program.option('-d, --dryrun', 'displays the command instead of executing it', false).//
            option('-s, --shellDebug', 'debugging around the shell', false).//
            option('-a, --all', 'executes this in all projects', false)
    }

    program = require('commander').//
        arguments('').//
        version('0.1.0')//

    executeScripts(commandContext: CommandContext, script: ScriptDetails, all: boolean): Promise<ShellResult[]> {
        let processor = this.scriptProcessor.get(script.type);
        return processor(commandContext, this.config, script)
    }

    addScripts(scripts: ScriptDetails[], options: (program: any) => any) {
        scripts.forEach(script => {
            this.command(script.name, script.description, options).action((cmd: any) => {
                    if (cmd.dryrun) {
                        if (cmd.all) {console.log("In every project...")}
                        console.log(script.name + " (" + script.type + ")", script.description)
                        console.log()
                        let nameWidth = Math.max(4, Strings.maxLength(script.commands.map(s => s.name)))
                        let cmdWidth = Math.max(4, Strings.maxLength(script.commands.map(s => s.command)))
                        console.log('Step'.padEnd(nameWidth), 'Command')
                        console.log('-'.padEnd(nameWidth, '-'), '-'.padEnd(cmdWidth, '-'))
                        script.commands.forEach(c => console.log(c.name.padEnd(nameWidth), c.command))
                    } else this.executeScripts({shellDebug: cmd.shellDebug, all: cmd.all}, script, cmd.all).then(consoleHandleShell(script.name), consoleHandleShell(script.name))
                }
            )
        })
    }

    constructor(config: Config, scriptProcessor: ScriptProcessorMap) {
        this.scriptProcessor = scriptProcessor;
        this.config = config

        this.command('config', 'displays the config', this.defaultOptions).//
            action((cmd: any) => console.log(laoban, JSON.stringify(config, null, 2)))
        this.command('projects', 'lists the projects under the laoban directory', (p: any) => p).//
            action((cmd: any) => Files.findProjectFiles(config.directory).forEach(p => console.log(p)))
        let scripts = [...config.projectScripts, ...config.globalScripts]
        this.addScripts(config.projectScripts, this.projectOptions)
        this.addScripts(config.globalScripts, this.defaultOptions)

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

function projectScriptProcessor(context: CommandContext, c: Config, s: ScriptDetails): Promise<ShellResult[]> {
    return Promise.all(Files.findProjectFiles(c.directory).map(fd => {
        let command = `cd ${fd}\n` + s.commands.map(s => s.command).join("\n")
        return executeShell(context.shellDebug, command);
    }))
}
function globalScriptProcessor(context: CommandContext, c: Config, s: ScriptDetails): Promise<ShellResult[]> {
    let command = s.commands.map(s => s.command).join("\n")
    let result = executeShell(context.shellDebug, command);
    return Promise.all([result])
}

let scriptProcessor : ScriptProcessorMap= new Map()
scriptProcessor.set('project', projectScriptProcessor)
scriptProcessor.set('global', globalScriptProcessor)

let cli = new Cli(configProcessor(laoban, config), scriptProcessor);

cli.start(process.argv)