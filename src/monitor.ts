import * as readline from "readline";
import {CommandDecorator, GenerationDecorator, ScriptDecorator} from "./decorators";


export class Status {

    directoryToLogName: (dir: string)=> string
    generations: GenerationStatus[] = []
    gen: number = -1

        constructor(directoryToLogName: (dir: string) => string) {this.directoryToLogName = directoryToLogName;}
    genStatus() {return this.generations[this.gen]}
    dirStatus(dir: string) {return this.genStatus().directories.get(dir)}

    generationStart() {
        this.gen = this.gen + 1;
        this.generations[this.gen] = {directories: new Map()}
    }
    scriptStart(directory: string) {
        let status = this.genStatus()
        status.directories.set(directory, {commands: [], finished: false})
    }
    scriptEnd(directory: string) {
        let status = this.dirStatus(directory)
        status.finished = true
    }

    commandStart(directory: string, command: string) {
        let status = this.dirStatus(directory)
        status.commands.push(command)
    }
    commandFinished(directory: string, command: string) {
    }
    dumpStatus() {
        this.generations.forEach((gen, i) => {
            console.log("generation", i);
            [...gen.directories.keys()].sort().forEach((dir, i) => {
                let status = gen.directories.get(dir);
                console.log('  ', `(${i}`, dir + (status.finished ? ' finished' : ''))
                console.log('    ', status.commands.join(','))
            })
        })
    }
    logStatus() {
        this.generations.forEach((gen, i) => {
            console.log("generation", i);
            [...gen.directories.keys()].sort().forEach((dir, i) => {
                let status = gen.directories.get(dir);
                console.log('  ', `(${i}`, this.directoryToLogName(dir) + (status.finished ? ' finished' : ''))
            })
        })
    }
}

interface GenerationStatus {
    directories: Map<string, DirectoryStatus>
}
interface DirectoryStatus {
    commands: string[]
    finished: boolean
}

function help() {
    console.log('Welcome to the status screen for Laoban')
    console.log('   Press ? for this help')
    console.log('   Press s for overall status')
    console.log('   Press l for information about where the logs are')
}

export let monitorGenerationDecorator: GenerationDecorator = e => d => {
    if (d.length > 0) {
        let status = d[0].scriptInContext.status;
        status.generationStart()
    }
    return e(d)
}

export let monitorScriptDecorator: ScriptDecorator = e => d => {
    let status = d.scriptInContext.status
    let directory = d.detailsAndDirectory.directory;
    status.scriptStart(directory)
    return e(d).then((r) => {
        status.scriptEnd(directory);
        return r
    })
}

export let monitorCommandDecorator: CommandDecorator = e => d => {
    let status = d.scriptInContext.status
    let directory = d.detailsAndDirectory.directory
    let command = d.details.commandString;
    status.commandStart(directory, command)
    return e(d).then(r => {
        status.commandFinished(directory, command)
        return r
    })
}
export function monitor(status: Status, promise: Promise<void>) {
    readline.emitKeypressEvents(process.stdin);
    promise.then(() => process.exit(0))
    process.stdin.setRawMode(true);
    process.stdin.resume()
    process.stdin.on('keypress', (str, key) => {
        switch (str) {
            case '?':
                help();
                break
            case 's':
                console.clear()
                status.dumpStatus();
                break;
            case 'l':
                console.clear()
                status.logStatus();
                break;
        }
        if (key.sequence == '\x03') {
            process.kill(process.pid, 'SIGINT')
        }
    })
}
