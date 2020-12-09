import * as cp from 'child_process'
import {ExecException} from 'child_process'
import {CommandDefn, Envs, ProjectDetailsAndDirectory, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import {cleanUpEnv, derefence, derefenceToUndefined} from "./configProcessor";
import * as path from "path";
import {Promise} from "core-js";
import {partition} from "./utils";
import {splitGenerationsByLinks} from "./generations";
import {Writable} from "stream";
import * as fs from "fs";

export interface RawShellResult {
    err: any,
    stdout: string,
    stderr: string
}
export interface ShellResult extends RawShellResult {
    details: ShellCommandDetails<CommandDetails>
    duration: number
}

export interface ScriptResult {
    scd: ScriptInContextAndDirectory,
    results: ShellResult[],
    duration: number
}

export type  Generation = ScriptInContextAndDirectory[]
export type  Generations = Generation[]
export type GenerationsResult = ScriptResult[][]
export type GenerationResult = ScriptResult[]


export interface ShellCommandDetails<Cmd> {
    scriptInContext: ScriptInContext,
    detailsAndDirectory: ProjectDetailsAndDirectory
    details: Cmd,
    logStream: Writable
}

export interface CommandDetails {
    command: CommandDefn,
    dic: any, //All the things that can be used to deference variables
    env: Envs //The envs with their variables dereferenced
    directory: string, // the actual directory that the command will be executed in
    commandString: string
}

function calculateDirectory(directory: string, command: CommandDefn) { return (command.directory) ? path.join(directory, command.directory) : directory;}

export function streamName(sessionDir: string, sessionId: string, directory: string) {
    return path.join(sessionDir, sessionId, directory.replace(/\//g, '_'))
}


export function buildShellCommandDetails(scd: ScriptInContextAndDirectory): ShellCommandDetails<CommandDetails>[] {
    let result = scd.scriptInContext.details.commands.map(cmd => {
        let directory = calculateDirectory(scd.detailsAndDirectory.directory, cmd)
        let dic = {...scd.scriptInContext.config, projectDirectory: scd.detailsAndDirectory.directory, projectDetails: scd.detailsAndDirectory.projectDetails}
        let env = cleanUpEnv(dic, scd.scriptInContext.details.env);
        let result: ShellCommandDetails<CommandDetails> = {
            ...scd,
            details: ({
                command: cmd,
                commandString: derefence(dic, cmd.command),
                dic: dic,
                env: env,
                directory: derefence(dic, directory),
            })
        };
        return result
    });
    // console.log('buildShellCommandDetails', result)
    return result
}

export let executeOneGeneration: (e: ExecuteOneScript) => ExecuteOneGeneration = e => gen => Promise.all(gen.map(x => e(x)))

export function executeAllGenerations(executeOne: ExecuteOneGeneration, reporter: (GenerationResult) => void): ExecuteGenerations {
    let fn = (gs, sofar) => {
        if (gs.length == 0) return Promise.resolve(sofar)
        return executeOne(gs[0]).then(gen0Res => {
            reporter(gen0Res)
            return fn(gs.slice(1), [...sofar, gen0Res])
        })
    }
    return gs => fn(gs, [])
}

export let executeScript: (e: ExecuteOne) => ExecuteOneScript = e => (scd: ScriptInContextAndDirectory) => {
    let startTime = new Date().getTime()
    return executeOneAfterTheOther(e)(buildShellCommandDetails(scd)).then(results => ({results: [].concat(...results), scd, duration: new Date().getTime() - startTime}))
}

function executeOneAfterTheOther<From, To>(fn: (from: From) => Promise<To>): (froms: From[]) => Promise<To[]> {
    return froms => froms.reduce((res, f) => res.then(r => fn(f).then(to => [...r, to])), Promise.resolve([]))
}


export type RawExecutor = (d: ShellCommandDetails<CommandDetails>) => Promise<RawShellResult>
export type ExecuteOne = (d: ShellCommandDetails<CommandDetails>) => Promise<ShellResult[]>

export type ExecuteGenerations = (generations: Generations) => Promise<GenerationsResult>
export type ExecuteOneGeneration = (generation: Generation) => Promise<GenerationResult>
export type ExecuteOneScript = (s: ScriptInContextAndDirectory) => Promise<ScriptResult>

export type GenerationsDecorator = (e: ExecuteGenerations) => ExecuteGenerations
export type ExecuteScriptDecorator = (e: ExecuteOneScript) => ExecuteOneScript
export type ExecuteOneDecorator = (e: ExecuteOne) => ExecuteOne
export type MakeLogStream = (directory: string) => Writable
export type AppendToFileIf = (condition: any | undefined, name: string, content: () => string) => Promise<void>
type Finder = (c: ShellCommandDetails<CommandDetails>) => ExecuteOne

interface ToFileDecorator {
    appendCondition: (d: ShellCommandDetails<CommandDetails>) => any | undefined
    filename: (d: ShellCommandDetails<CommandDetails>) => string
    content: (d: ShellCommandDetails<CommandDetails>, res: ShellResult) => string
}

interface GuardDecorator {
    guard: (d: ShellCommandDetails<CommandDetails>) => any | undefined
    valid: (guard: any, d: ShellCommandDetails<CommandDetails>) => any
}

interface StdOutDecorator {
    condition: (d: ShellCommandDetails<CommandDetails>) => any | undefined,
    pretext: (d: ShellCommandDetails<CommandDetails>) => string,
    transform: (sr: ShellResult) => ShellResult,
    posttext: (d: ShellCommandDetails<CommandDetails>, sr: ShellResult) => string
}
const shouldAppend = (d: ShellCommandDetails<CommandDetails>) => !d.scriptInContext.dryrun;
const dryRunContents = (d: ShellCommandDetails<CommandDetails>) => {
    let trim = trimmedDirectory(d.scriptInContext)
    return `${trim(d.details.directory).padEnd(d.scriptInContext.dirWidth)} ${d.details.commandString}`;
}
export function consoleOutputFor(res: ShellResult): string {
    // console.log('consoleOutputFor', res)
    let errorString = res.err ? `***Error***${res.err}\n` : ""
    let stdErrString = res.stderr.length > 0 ? `***StdError***${res.stderr}\n` : ""
    // console.log('errorString', errorString)
    // console.log('stdErrString', stdErrString)
    return `${res.stdout}${errorString}${stdErrString}`
}


//TODO generize this
export function chain(executors: ExecuteOneDecorator[]): ExecuteOneDecorator {return raw => executors.reduce((acc, v) => v(acc), raw)}
export function chainGens(executors: GenerationsDecorator[]): GenerationsDecorator {return raw => executors.reduce((acc, v) => v(acc), raw)}
function calculateVariableText(d: ShellCommandDetails<CommandDetails>): string {
    let dic = d.details.dic
    let simplerdic = {...dic}
    delete simplerdic.scripts
    return [`Raw command is [${d.details.command.command}] became [${d.details.commandString}]`,
        "legal variables are",
        JSON.stringify(simplerdic, null, 2)].join("\n") + "\n"
}

interface GenerationsDecoratorTemplate {
    condition: (scd: ScriptInContext) => boolean,
    transform: (scd: ScriptInContext, g: Generations) => Generations
}

function trimmedDirectory(sc: ScriptInContext) {
    return (dir: string) => dir.substring(sc.config.laobanDirectory.length + 1)
}

//export type ExecuteOneScript = (s: ScriptInContextAndDirectory) => Promise<ScriptResult>
export class ScriptDecorators {
    static normalDecorators(): ExecuteScriptDecorator {
        return e => e
    }
    static shellDecoratorForScript: ExecuteScriptDecorator = e => scd => {
        scd.logStream.write('In Shell Decorator')
        return e(scd)
    }


}

export class GenerationsDecorators {
    static normalDecorators() {
        return chainGens([this.PlanDecorator, this.ThrottlePlanDecorator, this.LinkPlanDecorator].map(this.applyTemplate))
    }

    static PlanDecorator: GenerationsDecoratorTemplate = {
        condition: scd => {
            return scd.genPlan
        },
        transform: (sc, gens) => {
            let trim = trimmedDirectory(sc)
            if (sc.dryrun) {
                gens.forEach((gen, i) => {
                    console.log("Generation", i)
                    gen.forEach(scd => {
                        if (scd.scriptInContext.details.commands.length == 1)
                            console.log('   ', trim(scd.detailsAndDirectory.directory), scd.scriptInContext.details.commands[0].command)
                        else {
                            console.log('   ', trim(scd.detailsAndDirectory.directory))
                            scd.scriptInContext.details.commands.forEach(c => console.log('       ', c.command))
                        }
                    })
                })
            } else gens.forEach((gen, i) => console.log("Generation", i, gen.map(scd => trim(scd.detailsAndDirectory.directory)).join(", ")))
            return []
        }
    }
    static ThrottlePlanDecorator: GenerationsDecoratorTemplate = {
        condition: scd => scd.throttle > 0,
        transform: (scd, gens) => [].concat(...(gens.map(gen => partition(gen, scd.throttle))))
    }

    static LinkPlanDecorator: GenerationsDecoratorTemplate = {
        condition: scd => scd.links || scd.details.inLinksOrder,
        transform: (scd, g) => [].concat(...g.map(splitGenerationsByLinks))
    }

    static applyTemplate: (t: GenerationsDecoratorTemplate) => GenerationsDecorator = t => e => gens => {
        if (gens.length > 0 && gens[0].length > 0) {
            let scd: ScriptInContext = gens[0][0].scriptInContext;
            if (t.condition(scd)) {
                return e(t.transform(scd, gens))
            }
        }
        return e(gens)
    }
}


export class ExecuteOneDecorators {

    static normalDecorator(a: AppendToFileIf): ExecuteOneDecorator {
        return chain([
            ...[ExecuteOneDecorators.guard].map(ExecuteOneDecorators.guardDecorate),
            ExecuteOneDecorators.dryRun,
            ...[ExecuteOneDecorators.status, ExecuteOneDecorators.profile, ExecuteOneDecorators.log].map(ExecuteOneDecorators.fileDecorate(a)),
            ExecuteOneDecorators.quietDisplay,
            ...[ExecuteOneDecorators.variablesDisplay].map(ExecuteOneDecorators.stdOutDecorator)
        ])
    }

    static fileDecorate: (a: AppendToFileIf) => (fileDecorator: ToFileDecorator) => ExecuteOneDecorator = appendIf => dec => e =>
        d => e(d).then(res => Promise.all(res.map(r => appendIf(dec.appendCondition(d) && shouldAppend(d), dec.filename(d), () => dec.content(d, r)))).then(() => res))


    static status: ToFileDecorator = {
        appendCondition: d => d.details.command.status,
        filename: d => path.join(d.detailsAndDirectory.directory, d.scriptInContext.config.status),
        content: (d, res) => `${d.scriptInContext.timestamp.toISOString()} ${res.err === null} ${d.details.command.name}\n`
    }
    static profile: ToFileDecorator = {
        appendCondition: d => d.details.command.name,
        filename: d => path.join(d.detailsAndDirectory.directory, d.scriptInContext.config.profile),
        content: (d, res) => `${d.scriptInContext.details.name} ${d.details.command.name} ${res.duration}\n`
    }
    static log: ToFileDecorator = {
        appendCondition: d => true,
        filename: d => path.join(d.detailsAndDirectory.directory, d.scriptInContext.config.log),
        content: (d, res) => `${d.scriptInContext.timestamp} ${d.details.commandString}\n${res.stdout}\nTook ${res.duration}\n\n`
    }

    static dryRun: ExecuteOneDecorator = e => d => {
        if (d.scriptInContext.dryrun) {
            let value = dryRunContents(d);
            // console.log('dryRun', value)
            d.logStream.write(value)
            d.logStream.write('\n')
            return Promise.resolve([{duration: 0, details: d, stdout: value, err: null, stderr: ""}])
        } else return e(d)
    }
    static stdOutDecorator: (dec: StdOutDecorator) => ExecuteOneDecorator = dec => e => d =>
        dec.condition(d) ? e(d).then(sr => sr.map(r => {
            let value = `${dec.pretext(d)}${r.stdout}${dec.posttext(d, r)}`;
            console.log('stdOutDecorator', value)
            r.details.logStream.write(value)
            return ({...r, stdout: value})
        })) : e(d)


    static variablesDisplay: StdOutDecorator = {
        condition: d => d.scriptInContext.variables,
        pretext: d => calculateVariableText(d),
        transform: sr => sr,
        posttext: (d, sr) => ''
    }

    static quietDisplay: ExecuteOneDecorator = e => d =>
        d.scriptInContext.quiet ? e(d).then(sr => sr.map(r => ({...r, stdout: ''}))) : e(d)


    static guardDecorate: (guardDecorator: GuardDecorator) => ExecuteOneDecorator = dec => e =>
        d => {
            let guard = dec.guard(d)
            return (!guard || dec.valid(guard, d)) ? e(d) : Promise.resolve([])
        }

    // static pmGuard: GuardDecorator = {
    //     guard: d => d.scd.scriptInContext.details.pmGuard,
    //     valid: (g, d) => d.scd.scriptInContext.config.packageManager === g
    // }
    // static osGuard: GuardDecorator = {
    //     guard: d => d.scd.scriptInContext.details.osGuard,
    //     valid: (g, d) => d.scd.scriptInContext.config.os === g
    // }
    static guard: GuardDecorator = {
        guard: d => d.scriptInContext.details.guard,
        valid: (g, d) => {
            let value = derefenceToUndefined(d.details.dic, g);
            let result = value != ''
            // console.log('guard', d.details.commandString, value, typeof value, result)
            return result
        }
    }
}

function jsOrShellFinder(js: ExecuteOne, shell: ExecuteOne): Finder {
    return c => (c.details.commandString.startsWith('js:')) ? js : shell

}
export function timeIt(e: RawExecutor): ExecuteOne {
    return d => {
        let startTime = new Date()
        return e(d).then(res => [{...res, details: d, duration: (new Date().getTime() - startTime.getTime())}]);
    }
}

export function defaultExecutor(a: AppendToFileIf) { return make(execInSpawn, execJS, timeIt, ExecuteOneDecorators.normalDecorator(a))}

export function make(shell: RawExecutor, js: RawExecutor, timeIt: (e: RawExecutor) => ExecuteOne, ...decorators: ExecuteOneDecorator[]): ExecuteOne {
    let decorate = chain(decorators)
    let decoratedShell = decorate(timeIt(shell))
    let decoratedJs = decorate(timeIt(js))
    let finder = jsOrShellFinder(decoratedJs, decoratedShell)
    return c => finder(c)(c)
}

export let execInShell: RawExecutor = (d: ShellCommandDetails<CommandDetails>) => {
    let options = d.details.env ? {cwd: d.details.directory, env: {...process.env, ...d.details.env}} : {cwd: d.details.directory}
    return new Promise<RawShellResult>((resolve, reject) =>
        cp.exec(d.details.commandString, options, (err: any, stdout: string, stderr: string) =>
            resolve({err: err, stdout: stdout.trimRight(), stderr: stderr})))
}
export let execInSpawn: RawExecutor = (d: ShellCommandDetails<CommandDetails>) => {
    let options = d.details.env ? {cwd: d.details.directory, env: {...process.env, ...d.details.env}} : {cwd: d.details.directory}
    return new Promise<RawShellResult>((resolve, reject) => {
        let child = cp.spawn(d.details.commandString, {shell: true})
        child.stdout.on('data', data => (d.logStream.write(data)))
        child.stderr.on('data', data => (d.logStream.write(data)))
        child.on('close', (code) => {
            resolve({err: code, stdout: "old stdout", stderr: "oldstderr"})
        })
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
        if (env) process.env = env;
        return block()
    } finally {process.env = oldEnv}
}


let execJS: RawExecutor = d => {
    try {
        let res = executeInChangedEnv<any>(d.details.env, () => executeInChangedDir(d.details.directory,
            () => Function("return  " + d.details.commandString.substring(3))().toString()))
        return Promise.resolve({err: null, stdout: res.toString(), stderr: ""})
    } catch (e) {
        return Promise.resolve({err: e, stdout: `Error: ${e} Command was [${d.details.commandString}]`, stderr: ""})
    }
}
