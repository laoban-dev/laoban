import * as cp from 'child_process'
import {ExecException} from 'child_process'
import {CommandDefn, Envs, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import {cleanUpEnv, derefence, derefenceToUndefined} from "./configProcessor";
import * as path from "path";
import {Promise} from "core-js";
import {partition} from "./utils";
import {splitGenerationsByLinks} from "./generations";

export interface RawShellResult {
    err: ExecException | null,
    stdout: string,
    stderr: string
}
export interface ShellResult {
    details:  ShellCommandDetails<CommandDetails>
    duration: number,
    err: ExecException | null,
    stdout: string,
    stderr: string
}

export interface ScriptResult {
    scd: ScriptInContextAndDirectory,
    results: ShellResult[],
    duration: number
}

//TODO consider ifG refactor this a little so that there is only one script being executed.
export type  Generation = ScriptInContextAndDirectory[]
export type  Generations = Generation[]
export type GenerationsResult = ScriptResult[][]
export type GenerationResult = ScriptResult[]


export interface ShellCommandDetails<Cmd> {
    scd: ScriptInContextAndDirectory,
    details: Cmd,
}

export interface CommandDetails {
    command: CommandDefn,
    dic: any, //All the things that can be used to deference variables
    env: Envs //The envs with their variables dereferenced
    directory: string, // the actual directory that the command will be executed in
    commandString: string,
}

function calculateDirectory(directory: string, command: CommandDefn) { return (command.directory) ? path.join(directory, command.directory) : directory;}

export function buildShellCommandDetails(scd: ScriptInContextAndDirectory): ShellCommandDetails<CommandDetails>[] {
    let result = scd.scriptInContext.details.commands.map(cmd => {
        let directory = calculateDirectory(scd.detailsAndDirectory.directory, cmd)
        let dic = {...scd.scriptInContext.config, projectDirectory: scd.detailsAndDirectory.directory, projectDetails: scd.detailsAndDirectory.projectDetails}
        let env = cleanUpEnv(dic, scd.scriptInContext.details.env);
        let result: ShellCommandDetails<CommandDetails> = {
            scd: scd,
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
export type ExecutorDecorator = (e: ExecuteOne) => ExecuteOne
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
    pretext: (d: ShellCommandDetails<CommandDetails>) => string
    posttext: (d: ShellCommandDetails<CommandDetails>, sr: ShellResult) => string
}
const shouldAppend = (d: ShellCommandDetails<CommandDetails>) => !d.scd.scriptInContext.dryrun;
const dryRunContents = (d: ShellCommandDetails<CommandDetails>) => `${d.details.directory} ${d.details.commandString}`;

export function consoleOutputFor( res: ShellResult): string {
    // console.log('consoleOutputFor', res)
    let errorString = res.err ? `***Error***${res.err}\n` : ""
    let stdErrString = res.stderr.length > 0 ? `***StdError***${res.stderr}\n` : ""
    // console.log('errorString', errorString)
    // console.log('stdErrString', stdErrString)
    return `${res.stdout}${errorString}${stdErrString}`
}

//TODO generize this
export function chain(executors: ExecutorDecorator[]): ExecutorDecorator {return raw => executors.reduce((acc, v) => v(acc), raw)}
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

export class GenerationsDecorators {
    static normalDecorators() {
        return chainGens([this.PlanDecorator, this.ThrottlePlanDecorator, this.LinkPlanDecorator].map(this.applyTemplate))
    }

    static PlanDecorator: GenerationsDecoratorTemplate = {
        condition: scd => {
            return scd.genPlan
        },
        transform: (scd, g) => {
            g.forEach((gen, i) => console.log("Generation", i, gen.map(scd => scd.detailsAndDirectory.directory).join(", ")))
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

export class ExecuteScriptDecorators {

    static normalDecorator(a: AppendToFileIf): ExecutorDecorator {
        return chain([
            ...[ExecuteScriptDecorators.guard, ExecuteScriptDecorators.osGuard, ExecuteScriptDecorators.pmGuard].map(ExecuteScriptDecorators.guardDecorate),
            ExecuteScriptDecorators.dryRun,
            ExecuteScriptDecorators.quietDisplay,
            ...[ExecuteScriptDecorators.variablesDisplay, ExecuteScriptDecorators.shellDisplay].map(ExecuteScriptDecorators.stdOutDecorator),
            ...[ExecuteScriptDecorators.status, ExecuteScriptDecorators.profile, ExecuteScriptDecorators.log].map(ExecuteScriptDecorators.fileDecorate(a))])
    }

    static fileDecorate: (a: AppendToFileIf) => (fileDecorator: ToFileDecorator) => ExecutorDecorator = appendIf => dec => e =>
        d => e(d).then(res => Promise.all(res.map(r => appendIf(dec.appendCondition(d) && shouldAppend(d), dec.filename(d), () => dec.content(d, r)))).then(() => res))


    static status: ToFileDecorator = {
        appendCondition: d => d.details.command.status,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.status),
        content: (d, res) => `${d.scd.scriptInContext.timestamp.toISOString()} ${res.err === null} ${d.details.command.name}\n`
    }
    static profile: ToFileDecorator = {
        appendCondition: d => d.details.command.name,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.profile),
        content: (d, res) => `${d.scd.scriptInContext.details.name} ${d.details.command.name} ${res.duration}\n`
    }
    static log: ToFileDecorator = {
        appendCondition: d => true,
        filename: d => path.join(d.scd.detailsAndDirectory.directory, d.scd.scriptInContext.config.log),
        content: (d, res) => `${d.scd.scriptInContext.timestamp} ${d.details.commandString}\n${res.stdout}\nTook ${res.duration}\n\n`
    }

    static dryRun: ExecutorDecorator = e => d =>
        d.scd.scriptInContext.dryrun ? Promise.resolve([{duration: 0, details: d, stdout: dryRunContents(d), err: null, stderr: ""}]) : e(d)

    static stdOutDecorator: (dec: StdOutDecorator) => ExecutorDecorator = dec => e => d =>
        dec.condition(d) ? e(d).then(sr => sr.map(r => ({...r, stdout: `${dec.pretext(d)}${r.stdout}${dec.posttext(d, r)}`}))) : e(d)

    static shellDisplay: StdOutDecorator = {
        condition: d => d.scd.scriptInContext.shell,
        pretext: d => `#### ${d.details.directory} ${d.details.commandString}${d.details.env ? ', Env: ' + JSON.stringify(d.details.env) : ''}\n`,
        posttext: (d, sr) => '\n---------------'
    }

    static variablesDisplay: StdOutDecorator = {
        condition: d => d.scd.scriptInContext.variables,
        pretext: d => calculateVariableText(d),
        posttext: (d, sr) => ''
    }

    static quietDisplay: ExecutorDecorator = e => d =>
        d.scd.scriptInContext.quiet ? e(d).then(sr => sr.map(r => ({...r, stdout: ''}))) : e(d)


    static guardDecorate: (guardDecorator: GuardDecorator) => ExecutorDecorator = dec => e =>
        d => {
            let guard = dec.guard(d)
            // console.log('guardDec', d.scd.scriptInContext.details.guard, guard)
            return (!guard || dec.valid(guard, d)) ? e(d) : Promise.resolve([])
        }

    static pmGuard: GuardDecorator = {
        guard: d => d.scd.scriptInContext.details.pmGuard,
        valid: (g, d) => d.scd.scriptInContext.config.packageManager === g
    }
    static osGuard: GuardDecorator = {
        guard: d => d.scd.scriptInContext.details.osGuard,
        valid: (g, d) => d.scd.scriptInContext.config.os === g
    }
    static guard: GuardDecorator = {
        guard: d => d.scd.scriptInContext.details.guard,
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

export function defaultExecutor(a: AppendToFileIf) { return make(execInShell, execJS, timeIt, ExecuteScriptDecorators.normalDecorator(a))}

export function make(shell: RawExecutor, js: RawExecutor, timeIt: (e: RawExecutor) => ExecuteOne, ...decorators: ExecutorDecorator[]): ExecuteOne {
    let decorate = chain(decorators)
    let decoratedShell = decorate(timeIt(shell))
    let decoratedJs = decorate(timeIt(js))
    let finder = jsOrShellFinder(decoratedJs, decoratedShell)
    return c => finder(c)(c)
}

export let execInShell: RawExecutor = (d:  ShellCommandDetails<CommandDetails>) => {
    let options = d.details.env ? {cwd: d.details.directory, env: {...process.env, ...d.details.env}} : {cwd: d.details.directory}
    return new Promise<RawShellResult>((resolve, reject) =>
        cp.exec(d.details.commandString, options, (err: any, stdout: string, stderr: string) =>
            resolve({err: err, stdout: stdout.trimRight(), stderr: stderr})))
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
