// js.executor.ts

import {Writable} from "node:stream"
import {Observability} from "@laoban/observability"
import {DirectoryName, ExecutorFn, ExitCode} from "@laoban/execution"
import {Env} from "@laoban/records"

export type JsExecutionContext<W> = Readonly<{
    cwd: DirectoryName
    env: Env
    writable: W
    observability: Observability
}>

function isPromiseLike(x: unknown): x is Promise<unknown> {
    return x !== null &&
        (typeof x === "object" || typeof x === "function") &&
        typeof (x as { then?: unknown }).then === "function"
}

/**
 * Executes trusted JavaScript command text.
 *
 * The command is evaluated synchronously as an expression.
 *
 * process.cwd() is temporarily changed to cwd only for the synchronous
 * evaluation window, then restored immediately.
 *
 * Returned strings are written through observability.log. In script execution
 * that means the returned output goes through the module channel lifecycle:
 * module observability writes -> withModuleObservability closes -> generation flush projects.
 *
 * Promise-returning commands are deliberately rejected. Async JS commands cannot
 * safely rely on temporary process.cwd(), and command output must be complete
 * before the surrounding module observability closes.
 */
export const executeNodeJs: ExecutorFn<Writable> = async (
    command,
    cwd,
    env,
    writable,
    observability,
): Promise<ExitCode> => {
    const context: JsExecutionContext<Writable> = {
        cwd,
        env,
        writable,
        observability,
    }

    const oldCwd = process.cwd()

    try {
        const fn = new Function(
            "context",
            "cwd",
            "env",
            "writable",
            "observability",
            `"use strict"; return (${command});`,
        )

        process.chdir(cwd)

        let result: unknown
        try {
            result = fn(
                context,
                cwd,
                env,
                writable,
                observability,
            )
        } finally {
            process.chdir(oldCwd)
        }

        if (isPromiseLike(result)) {
            observability.log(
                "Error executing javascript command: Promise-returning JavaScript commands are not supported",
            )
            return 1
        }

        if (typeof result === "string")
            observability.log(result)

        return 0
    } catch (e) {
        try {
            process.chdir(oldCwd)
        } catch {
            // Preserve the original error.
        }

        observability.log(`Error executing javascript command: ${String(e)}`)
        return 1
    }
}