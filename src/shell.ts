import * as cp from 'child_process'
import {ExecException} from 'child_process'
import {CommandDefn, DirectoryAndResults, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import * as fs from "fs";
import * as path from "path";
import {derefence, replaceVarToUndefined} from "./configProcessor";
import {projectDetailsFile} from "./Files";


export interface RawShellResult {
    err: ExecException | null,
    stdout: string,
    stderr: string
}
export interface ShellResult {
    title: string,
    duration: number,
    err: ExecException | null,
    stdout: string,
    stderr: string
}

export function consoleHandleShell(drs: DirectoryAndResults[]) {
    drs.forEach(dr => dr.results.forEach(shellResult => {
        if (shellResult.err) {
            console.log(shellResult.title)
            console.log("Exited with error", shellResult.err)
            console.log(shellResult.stdout)
            if (shellResult.stderr != "")
                console.log("errors", shellResult.stderr)
            console.log("Exited with error", shellResult.err)

        }
        let result = shellResult.stdout.trimEnd();
        if (result.length > 0) console.log(result)
        if (shellResult.stderr) {console.error(shellResult.stderr.trimEnd())}
    }))
}


export function shellDebugPrint(drs: DirectoryAndResults[]) {
    drs.forEach(dr => {
        console.log(`############# ${dr.detailsAndDirectory.directory} ###############`)
        if (dr.detailsAndDirectory.projectDetails === undefined) console.log(`warning: ${projectDetailsFile} not found`)
        dr.results.forEach(sr => {
            console.log(sr.stdout.trimEnd())
            if (sr.stderr !== "") {
                console.log("#########ERRORS#############")
                console.error(sr.stderr.trimEnd())
                console.log("#######ERRORS END###########")
            }
        })
    })
}


export function noHandleShell(drs: DirectoryAndResults[]) {
}
function statusResults(scd: ScriptInContextAndDirectory, command: CommandDefn, result: ShellResult) {
    let statusFile = path.join(scd.detailsAndDirectory.directory, scd.scriptInContext.config.status)
    if (command.status) {
        let status = result.err ? false : true
        fs.appendFile(statusFile, `${scd.scriptInContext.timestamp.toISOString()} ${status} ${command.name}\n`, err => {
            if (err) console.log('error making status', scd.detailsAndDirectory, command, err)
        })
    }

}
function logResults(scd: ScriptInContextAndDirectory, command: CommandDefn, result: ShellResult): Promise<ShellResult> {
    statusResults(scd, command, result)
    let details = scd.scriptInContext.details;
    let context = scd.scriptInContext.context
    let logFile = path.join(scd.detailsAndDirectory.directory, scd.scriptInContext.config.log)
    return new Promise<ShellResult>((resolve, reject) => {
        if (logFile) {
            fs.appendFile(logFile, `${scd.scriptInContext.timestamp.toISOString()} ${command.name} ${command.command}\n`, err => {
                fs.appendFile(logFile, result.stdout, err => {
                    fs.appendFile(logFile, result.stderr, err => {
                        if (err) reject(result); else {
                            resolve(result);
                        }
                    })
                })
            })
        } else if (result.err) reject(result); else {
            resolve(result);
        }
    })
}

function calculateVariableText(variables: boolean, dic: any, directory: string, command: string, cmd: string): string {
    if (variables) {
        let simplerdic = {...dic}
        delete simplerdic.scripts
        return [`variables in ${directory} for command [${command}]`,
            `tranformed into [${cmd}]`, "legal variables are",
            JSON.stringify(simplerdic, null, 2),
            ''].join("\n")
    } else return ""
}
function executeCommandIn(dic: any, scd: ScriptInContextAndDirectory, command: CommandDefn, fn: (directory: string, cmd: string) => Promise<RawShellResult>): Promise<ShellResult> {
    let cmd = derefence(dic, command.command)
    let directory = scd.detailsAndDirectory.directory;
    let variables = calculateVariableText(scd.scriptInContext.variables, dic, directory, command.command, cmd)
    if (scd.scriptInContext.dryrun) {
        return Promise.resolve({title: command.name, err: null, stdout: scd.scriptInContext.variables ? variables : cmd, stderr: "", duration: -1})
    } else {
        let startTime = new Date()
        return fn(directory, cmd).then(raw => {
            let endTime = new Date();
            let duration = endTime.getTime() - startTime.getTime()
            if (command.name !== "")
                fs.appendFile(path.join(directory, scd.scriptInContext.config.profile), scd.scriptInContext.details.name + " " + command.name + " " + duration + "\n", (err) => {if (err) console.log(err)})
            let result = {title: command.name, err: raw.err, stdout: variables + raw.stdout, stderr: raw.stderr, duration: duration}
            return logResults(scd, command, result).then(() => result)
        })
    }
}

function executeShell(directory: string, cmd: string): Promise<RawShellResult> {
    return new Promise<RawShellResult>((resolve, reject) => {
        cp.exec(`cd ${directory}\n${cmd}`, (err: any, stdout: string, stderr: string) =>
            resolve({err: err, stdout: stdout, stderr: stderr}))
    })
}
function executeInJavascript(directory: string, cmd: string): Promise<RawShellResult> {
    let c = "return  " + cmd.substring(3);
    let start = process.cwd()
    process.chdir(directory)
    try {
        let stdout = Function(c)()
        return Promise.resolve({err: null, stdout: stdout, stderr: ""})
    } catch (e) {
        return Promise.resolve({err: e, stdout: `Command was [${c}]`, stderr: ""})
    } finally {
        process.chdir(start)
    }
}


export function executeShellCommand(dic: any) {
    return (scd: ScriptInContextAndDirectory, command: CommandDefn): Promise<ShellResult> =>
        executeCommandIn(dic, scd, command, command
            .command.startsWith("js:") ? executeInJavascript : executeShell)
}


function chain<Context, From, To>(context: Context, list: From[], fn: (context: Context, from: From) => Promise<To>): Promise<To[]> {
    if (list.length == 0) return Promise.resolve([])
    return fn(context, list[0]).then(to => chain(context, list.slice(1), fn).then(rest => [to, ...rest]))

}

export function executeShellDetails(scd: ScriptInContextAndDirectory): Promise<ShellResult[]> {
    let dic = {...scd.scriptInContext.config, projectDirectory: scd.detailsAndDirectory.directory, projectDetails: scd.detailsAndDirectory.projectDetails}
    let guard = scd.scriptInContext.details.guard;
    let canExecute = guard ? replaceVarToUndefined(dic, guard) : true
    // console.log("execute", guard, replaceVarToUndefined(dic, guard), canExecute, typeof canExecute)
    return canExecute ? chain(scd, scd.scriptInContext.details.commands, executeShellCommand(dic)) : Promise.resolve([])
}

export function executeShellDetailsInAllDirectories(sc: ScriptInContext): Promise<DirectoryAndResults[]> {
    let results: Promise<DirectoryAndResults>[] = sc.context.directories.//
        map(d => executeShellDetails({detailsAndDirectory: d, scriptInContext: sc}).then(res => ({detailsAndDirectory: d, results: res})));
    return Promise.all(results)
}