import * as cp from 'child_process'
import {ExecException} from 'child_process'
import {CommandDefn, DirectoryAndResults, ScriptInContext, ScriptInContextAndDirectory} from "./config";
import * as fs from "fs";
import * as path from "path";


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
        console.log(`############# ${dr.directory} ###############`)
        dr.results.forEach(sr => {
            console.log(sr.stdout.trimEnd())
            if (sr.stderr !== "") {
                console.log("#########ERRORS#############")
                console.error(sr.stderr.trimEnd())
            }
        })
    })
}

export function executeShell(shellDebug: boolean, title: string, cmd: string, logFile?: string): Promise<ShellResult> {
    return new Promise<ShellResult>((resolve, reject) => {
        cp.exec(cmd, (err: any, stdout: string, stderr: string) => {
                let result = {title: title, err: err, stdout: stdout, stderr: stderr}
                console.log('logfile', logFile)
                if (logFile) {
                    fs.appendFile(logFile, stdout, err => {
                        fs.appendFile(logFile, stderr, err => {
                            if (err) reject(result); else {
                                resolve(result);
                            }
                        })
                    })
                } else if (err) reject(result); else {
                    resolve(result);
                }
            }
        )
    })
}


function logResults(scd: ScriptInContextAndDirectory, result: ShellResult, resolve: (value: (ShellResult)) => void, reject: (reason?: any) => void) {
    let details = scd.scriptInContext.details;
    let context = scd.scriptInContext.context
    let logFile = path.join(scd.directory, scd.scriptInContext.config.log)
    if (logFile) {
        fs.appendFile(logFile, result.stdout, err => {
            fs.appendFile(logFile, result.stderr, err => {
                if (err) reject(result); else {
                    resolve(result);
                }
            })
        })
    } else if (result.err) reject(result); else {
        resolve(result);
    }
}
export function executeShellCommand(scd: ScriptInContextAndDirectory, command: CommandDefn): Promise<ShellResult> {
    return new Promise<ShellResult>((resolve, reject) => {
        cp.exec(`cd ${scd.directory}\n${command.command}`, (err: any, stdout: string, stderr: string) => {
                let result = {title: command.name, err: err, stdout: stdout, stderr: stderr}
                logResults(scd, result, resolve, reject);
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
        map(d => executeShellDetails({directory: d, scriptInContext: sc}).then(res => ({directory: d, results: res})));
    return Promise.all(results)
}