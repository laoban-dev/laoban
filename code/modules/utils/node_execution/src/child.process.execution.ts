// execution.childprocess.ts

import {spawn} from "node:child_process"
import {Writable} from "node:stream"
import {Observability} from "@laoban/observability"
import {DirectoryName,  ExecutorFn, ExitCode} from "@laoban/execution"
import {Env} from "@laoban/records";

export const executeChildProcess: ExecutorFn<Writable> = (
    command: string,
    cwd: DirectoryName,
    env: Env,
    writable: Writable,
    observability: Observability
): Promise<ExitCode> =>
    new Promise<ExitCode>(resolve => {
        observability.debug(["execution"], "debug", "spawning", {
            command,
            cwd
        })

        const child = spawn(command, {
            cwd,
            env: {
                ...process.env,
                ...env
            },
            shell: true
        })

        child.stdout.pipe(writable, {end: false})
        child.stderr.pipe(writable, {end: false})

        child.on("error", e => {
            observability.log(`Error spawning command [${command}] in [${cwd}]: ${String(e)}`)
            resolve(1)
        })

        child.on("close", code => {
            resolve(code ?? 1)
        })
    })