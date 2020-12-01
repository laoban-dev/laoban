import * as cp from 'child_process'
import {ExecException} from "child_process";
import {ScriptDetails} from "./config";


export interface ShellResult {
    title: string
    err: ExecException | null,
    stdout: string,
    stderr: string
}

export function consoleHandleShell(shellResults: ShellResult[]) {
    return shellResults.forEach(shellResult => {
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
    })
}


export function shellDebugPrint(results: ShellResult[]) {
    for (let i = 0; i < results.length; i++) {
        let sr = results[i]
        console.log("############################")
        console.log(sr.title + "  " + (sr.err ? sr.err : ""))
        console.log(sr.stdout)
        if (sr.stderr !== "") {
            console.log("#########ERRORS#############")
            console.error(sr.stderr)
        }
    }
}

export function executeShell(shellDebug: boolean, title: string, cmd: string): Promise<ShellResult> {
    return new Promise<ShellResult>((resolve, reject) => {
        cp.exec(cmd, (err: any, stdout: string, stderr: string) => {
            let result = {title: title, err: err, stdout: stdout, stderr: stderr}
            if (err) reject(result); else {
                resolve(result);
            }
        })
    })
}
