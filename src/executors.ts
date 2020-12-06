import * as cp from 'child_process'
import {ExecException} from 'child_process'
import {CommandDefn, Envs, ProjectDetailsAndDirectory, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import {cleanUpEnv, derefence} from "./configProcessor";
import * as path from "path";

export interface RawShellResult {
    err: ExecException | null,
    stdout: string,
    stderr: string
}
export interface ShellResult {
    duration: number,
    err: ExecException | null,
    stdout: string,
    stderr: string
}

interface ShellCommandDetails<Cmd> {
    scd: ScriptInContextAndDirectory,
    details: Cmd,
}

interface CommandDetails {
    command: CommandDefn,
    dic: any, //All the things that can be used to deference variables
    env: Envs //The envs with their variables dereferenced
    directory: string, // the actual directory that the command will be executed in
    commandString: string,
}

function calculateDirectory(directory: string, command: CommandDefn) { return (command.directory) ? path.join(directory, command.directory) : directory;}

function buildShellCommandDetails(scd: ScriptInContextAndDirectory): ShellCommandDetails<CommandDetails>[] {
    return scd.scriptInContext.details.commands.map(cmd => {
        let directory = calculateDirectory(scd.detailsAndDirectory.directory, cmd)
        let dic = {...scd.scriptInContext.config, projectDirectory: scd.detailsAndDirectory.directory, projectDetails: scd.detailsAndDirectory.projectDetails}
        return ({
            scd: scd,
            details: ({
                command: cmd,
                commandString: derefence(dic, cmd.command),
                dic: dic,
                env: cleanUpEnv(dic, scd.scriptInContext.details.env),
                directory: derefence(dic, directory),
            })
        })
    })
}

function addDirectoryDetailsToCommands(details: ProjectDetailsAndDirectory, sc: ScriptInContext): ScriptInContextAndDirectory { return ({detailsAndDirectory: details, scriptInContext: sc});}

export type RawExecutor = (d: ShellCommandDetails<CommandDetails>) => Promise<RawShellResult>
export type ExecuteOne = (d: ShellCommandDetails<CommandDetails>) => Promise<ShellResult>
export type ExecutorDecorator = (e: ExecuteOne) => ExecuteOne
export type AppendToFileIf = (condition: any | undefined, name: string, content: string) => Promise<void>
type Finder = (c: ShellCommandDetails<CommandDetails>) => ExecuteOne

interface ToFileDecorator {
    appendCondition: (d: ShellCommandDetails<CommandDetails>) => any | undefined
    filename: (d: ShellCommandDetails<CommandDetails>) => string
    content: (d: ShellCommandDetails<CommandDetails>, res: ShellResult) => string
}

const shouldAppend = (d: ShellCommandDetails<CommandDetails>) => !d.scd.scriptInContext.dryrun;
const dryRunContents = (d: ShellCommandDetails<CommandDetails>) => `${d.details.directory} ${d.details.commandString}`;

export function consoleOutputFor(d: ShellCommandDetails<CommandDetails>, res: ShellResult): string {
    let errorString = res.err ? `***Error***${res.err}\n` : ""
    let stdErrString = res.stderr.length > 0 ? `***StdError***${res.stderr}\n` : ""
    return `${errorString}${stdErrString}${res.stdout}`
}

export function chain(executors: ExecutorDecorator[]): ExecutorDecorator {return raw => executors.reduce((acc, v) => v(acc), raw)}

export class ExecutorDecorators {

    static normalDecorator(a: AppendToFileIf): ExecutorDecorator {
        return chain([ExecutorDecorators.dryRun,
            ...[ExecutorDecorators.status, ExecutorDecorators.profile, ExecutorDecorators.log].map(ExecutorDecorators.decorate(a)),
            ExecutorDecorators.consoleOutput])
    }

    static decorate: (a: AppendToFileIf) => (fileDecorator: ToFileDecorator) => ExecutorDecorator = appendIf => dec => e =>
        d => e(d).then(res => appendIf(dec.appendCondition(d) && shouldAppend(d), dec.filename(d), dec.content(d, res)).then(() => res))


    static status: ToFileDecorator = {
        appendCondition: d => d.details.command.status,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.status),
        content: (d, res) => `${d.scd.scriptInContext.timestamp} ${d.details.command.name} ${res.err !== null}\n`
    }
    static profile: ToFileDecorator = {
        appendCondition: d => d.details.command.name,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.profile),
        content: (d, res) => `${d.scd.scriptInContext.details.name} ${d.details.command.name}  ${res.duration}\n`
    }
    static log: ToFileDecorator = {
        appendCondition: d => true,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.log),
        content: (d, res) => `${d.scd.scriptInContext.timestamp} ${d.details.command.name}\n${res.stdout}\nTook ${res.duration}\n\n`
    }

    static dryRun: ExecutorDecorator = e => d => d.scd.scriptInContext.dryrun ? Promise.resolve({duration: 0, stdout: dryRunContents(d), err: null, stderr: ""}) : e(d)
    static consoleOutput: ExecutorDecorator = e => d => e(d).then(res => {
        console.log(consoleOutputFor(d, res));
        return res
    })

}


function jsOrShellFinder(js: ExecuteOne, shell: ExecuteOne): Finder {
    return c => (c.details.commandString.startsWith('js:')) ? js : shell

}
export function timeIt(e: RawExecutor): ExecuteOne {
    return d => {
        let startTime = new Date()
        return e(d).then(res => ({...res, duration: (new Date().getTime() - startTime.getTime())}));
    }
}

export function defaultExecutor(a: AppendToFileIf) { return make(execInShell, execJS, timeIt, ExecutorDecorators.normalDecorator(a))}

export function make(shell: RawExecutor, js: RawExecutor, timeIt: (e: RawExecutor) => ExecuteOne, ...decorators: ExecutorDecorator[]) {
    let decorate = chain(decorators)
    let decoratedShell = decorate(timeIt(shell))
    let decoratedJs = decorate(timeIt(js))
    let finder = jsOrShellFinder(decoratedJs, decoratedShell)
    return c => finder(c)(c)
}

export let execInShell: RawExecutor = d => {
    let options = d.details.env ? {cwd: d.details.directory, env: {...process.env, ...d.details.env}} : {cwd: d.details.directory}
    return new Promise<RawShellResult>((resolve, reject) => {
        cp.exec(d.details.commandString, options, (err: any, stdout: string, stderr: string) =>
            resolve({err: err, stdout: stdout, stderr: stderr}))
    })
}

//** The function passed in should probably not return a promise. The directory is changed, the function executed and then the directory is changed back
function executeInChangedDir<To>(dir: string, block: () => To): To {
    let oldDir = process.cwd()
    try {
        process.chdir(dir);
        return block()
    } finally {process.chdir(oldDir)}
}
//** The function passed in should probably not return a promise. The env is changed, the function executed and then the env changed back
function executeInChangedEnv<To>(env: Envs, block: () => To): To {
    let oldEnv = process.env
    try {
        process.env = env;
        return block()
    } finally {process.env = oldEnv}
}


let execJS: RawExecutor = d => {
    try {
        let block = Function('return ' + d.details.commandString.substring(3));
        let res = executeInChangedEnv<any>(d.details.env, executeInChangedDir(d.details.directory, block()))
        return Promise.resolve({err: null, stdout: res.toString(), stderr: ""})
    } catch (e) {
        return Promise.resolve({err: e, stdout: `Command was [${d.details.commandString}]`, stderr: ""})
    }
}
