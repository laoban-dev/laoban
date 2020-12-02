import * as cp from 'child_process'
import {ExecException} from 'child_process'
import {CommandDefn, DirectoryAndResults, ScriptDetails, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import * as fs from "fs";
import * as path from "path";
import {cleanUpCommand, derefence} from "./configProcessor";
import {projectDetailsFile} from "./Files";
import {Strings} from "./utils";


export interface ShellResult {
    title: string
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
        console.log(shellResult.stdout.trimEnd())
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
function logResults(scd: ScriptInContextAndDirectory, command: CommandDefn, result: ShellResult, resolve: (value: (ShellResult)) => void, reject: (reason?: any) => void) {
    statusResults(scd, command, result)
    let details = scd.scriptInContext.details;
    let context = scd.scriptInContext.context
    let logFile = path.join(scd.detailsAndDirectory.directory, scd.scriptInContext.config.log)
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
}
export function executeShellCommand(scd: ScriptInContextAndDirectory, command: CommandDefn): Promise<ShellResult> {
    let dic = {...scd.scriptInContext.config, projectDirectory: scd.detailsAndDirectory.directory, projectDetails: scd.detailsAndDirectory.projectDetails}
    return new Promise<ShellResult>((resolve, reject) => {
        let cmd = derefence(dic, command.command)
        if (scd.scriptInContext.dryrun) {
            resolve({title: command.name, err: null, stdout: cmd, stderr: ""})
        } else
            cp.exec(`cd ${scd.detailsAndDirectory.directory}\n${cmd}`, (err: any, stdout: string, stderr: string) => {
                    let result = {title: command.name, err: err, stdout: stdout, stderr: stderr}
                    logResults(scd, command, result, resolve, reject);
                }
            )
    })
}

function chain<Context, From, To>(context: Context, list: From[], fn: (context: Context, from: From) => Promise<To>): Promise<To[]> {
    if (list.length == 0) return Promise.resolve([])
    return fn(context, list[0]).then(to => chain(context, list.slice(1), fn).then(rest => [to, ...rest]))

}

export function executeShellDetails(scd: ScriptInContextAndDirectory): Promise<ShellResult[]> {
    return chain(scd, scd.scriptInContext.details.commands, executeShellCommand)
}

export function executeShellDetailsInAllDirectories(sc: ScriptInContext): Promise<DirectoryAndResults[]> {
    let results: Promise<DirectoryAndResults>[] = sc.context.directories.//
        map(d => executeShellDetails({detailsAndDirectory: d, scriptInContext: sc}).then(res => ({detailsAndDirectory: d, results: res})));
    return Promise.all(results)
}