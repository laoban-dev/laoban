#!/usr/bin/env node
import {findLaoban, laobanFile} from "./Files";
import * as fs from "fs";
import {configProcessor} from "./configProcessor";
import {Config, ScriptDetails, ScriptProcessorMap} from "./config";
import {Strings} from "./utils";

export class Cli {

    command(cmd: string, description: string, ...fns: ((a: any) => any)[]) {
        var p = this.program.command(cmd).description(description)
        fns.forEach(fn => p = fn(p))
        return p
    }

    defaultOptions(program: any): any {
        return program.option('-config, --config <config>', 'Overrides the default config file location')
    }
    program = require('commander').//
        arguments('').//
        version('0.1.0').//
        option('-d, --dryrun', 'displays the command instead of executing it')

    constructor(config: Config) {
        this.command('commands', 'lists the commands', this.defaultOptions).//
            action((cmd: any) => {
                let width = Strings.maxLength(([...config.globalScripts, ...config.projectScripts]).map(s => s.name))
                if (config.globalScripts) {
                    console.log('global')
                    config.globalScripts.forEach(s => console.log('   ', s.name.padEnd(width), s.description))
                }
                console.log()
                if (config.projectScripts) {
                    console.log('project')
                    config.projectScripts.forEach(s => console.log('   ', s.name.padEnd(width), s.description))
                }
                console.log()
                console.log("type 'loaban command <name>' for details on the command")
            });
        this.command('config', 'displays the config', this.defaultOptions).//
            action((cmd: any) => console.log(laoban, JSON.stringify(config, null, 2)))

        this.command('command <command>', 'lists the details on a single command', this.defaultOptions).//
            action((command: string, cmd: any) => {
                let scripts = [...config.globalScripts, ...config.projectScripts]
                let script: ScriptDetails = scripts.find(s => s.name === command)
                // console.log(scripts)
                if (script) {
                    console.log(script.name + " (" + script.type + ")", script.description)
                    console.log()
                    let nameWidth = Math.max(4, Strings.maxLength(script.commands.map(s => s.name)))
                    let cmdWidth = Math.max(4, Strings.maxLength(script.commands.map(s => s.command)))
                    console.log('Step'.padEnd(nameWidth), 'Command')
                    console.log('-'.padEnd(nameWidth, '-'), '-'.padEnd(cmdWidth, '-'))
                    script.commands.forEach(c => console.log(c.name.padEnd(nameWidth), c.command))
                } else
                    console.log('command ' + command + " not found. type laoban commands for a list of commands")
            })


        var p = this.program
        this.program.on('command:*', function () {
            console.error('Invalid command: %s\nSee --help for a list of available commands.', p.args.join(' '));
            process.exit(1);
        });

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
let scriptProcessor: ScriptProcessorMap = new Map()

let cli = new Cli(configProcessor(laoban, config));

cli.start(process.argv)