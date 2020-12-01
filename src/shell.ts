import * as cp from 'child_process'
import {ExecException} from "child_process";


export interface ShellResult {
    err: ExecException | null,
    stdout: string,
    stderr: string
}

export function consoleHandleShell(title: string): (shellResult: ShellResult[]) => void {
    return shellResults => shellResults.forEach(shellResult => {
        if (shellResult.err) {
            console.log(title)
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


export function executeShell(shellDebug: boolean, cmd: string): Promise<ShellResult> {
    if (shellDebug) {
        console.log(`executing ${cmd}`)
    }
    return new Promise<ShellResult>((resolve, reject) => {
        cp.exec(cmd, (err: any, stdout: string, stderr: string) => {
            if (shellDebug) {
                console.log(`  error ${cmd}`, err)
                console.log(`  std out for ${cmd}`, stdout)
                console.log(`  std err for ${cmd}`, stderr)
            }
            let result = {err: err, stdout: stdout, stderr: stderr}
            if (err) reject(result); else {
                resolve(result);
            }
        })
    })
}
