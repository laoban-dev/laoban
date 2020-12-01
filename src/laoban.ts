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
        return program.option('-d, --dryrun', 'displays the command instead of executing it', false)
    }
    projectOptions(program: any): any {
        return program.option('-d, --dryrun', 'displays the command instead of executing it', false).//
            option('-a, --all', 'executes this in all projects', false)
    }

    program = require('commander').//
        arguments('').//
        version('0.1.0')//


    addScripts(scripts: ScriptDetails[], options: (program: any) => any) {
        scripts.forEach(c => {
            this.command(c.name, c.description, options).action((cmd: any) => {
                    if (cmd.dryrun) {
                        let script: ScriptDetails = scripts.find(s => s.name === c.name)
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
                            console.log('software error command ' + c.name + " not found. type laoban commands for a list of commands")
                    } else
                        console.log('a', cmd.dryrun, c.name, c.description)
                }
            )
        })
    }

    constructor(config: Config) {
        this.command('config', 'displays the config', this.defaultOptions).//
            action((cmd: any) => console.log(laoban, JSON.stringify(config, null, 2)))
        let scripts = [...config.projectScripts, ...config.globalScripts]
        this.addScripts(config.projectScripts, this.projectOptions)
        this.addScripts(config.globalScripts, this.defaultOptions)

        var p = this.program
        this.program
            .on(
                'command:*'
                ,
                function () {
                    console.error('Invalid command: %s\nSee --help for a list of available commands.', p.args.join(' '));
                    process.exit(1);
                }
            );

        this.program
            .allowUnknownOption(
                false
            );

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