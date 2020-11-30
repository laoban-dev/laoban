export class Cli {
    program = require('commander').//
        arguments('').//
        version('0.1.0').//
        option('-dry, --dryrun', 'displays the command instead of executing it').//
        command('commands', 'lists the commands').action((cmd: any) => {
            console.log("executing commands")
        });
    parsed: any;
    start(argv: string[]) {
        if (process.argv.length == 2) {
            this.program.outputHelp();
            process.exit(2)
        }
        this.parsed = this.program.parse(argv); // notice that we have to parse in a new statement.
    }

}

let cli = new Cli();

cli.start(process.argv)