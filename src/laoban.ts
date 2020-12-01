#!/usr/bin/env node
import {findLaoban, laobanFile} from "./Files";
import * as fs from "fs";
import {configProcessor} from "./configProcessor";

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

    constructor() {
        this.command('commands', 'lists the commands', this.defaultOptions).//
            action((cmd: any) => console.log("executing commands!"));
        this.command('variables', 'lists the variables', this.defaultOptions).//
            action((cmd: any) => console.log("executing variables!"));

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
console.log(laoban, configProcessor(laoban, config))

let cli = new Cli();

cli.start(process.argv)