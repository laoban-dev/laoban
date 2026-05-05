import {spawn} from "node:child_process"
import * as fs from "node:fs"
import * as path from "node:path"

import {
    laobanDirectory,
    laobanExecutableDirectory,
} from "./fixture.directories"

export type LaobanRunResult = Readonly<{
    exitCode: number
    stdout: string
    stderr: string
    commandLine: string
    cwd: string
}>

export type LaobanLaunch = Readonly<{
    command: string
    args: string[]
}>

export type RunLaobanInFixtureOptions = Readonly<{
    fixtureDir: string
    args: string[]
    launch?: LaobanLaunch
    env?: Record<string, string | undefined>
}>

function isFile(filename: string): boolean {
    try {
        return fs.statSync(filename).isFile()
    } catch {
        return false
    }
}

function findTsNodeCli(): string {
    const candidates = [
        path.join(laobanDirectory, "code", "node_modules", "ts-node", "dist", "bin.js"),
        path.join(laobanDirectory, "node_modules", "ts-node", "dist", "bin.js"),
    ]

    const found = candidates.find(isFile)

    if (found === undefined) {
        throw new Error(
            [
                "Cannot find ts-node CLI.",
                ...candidates.map(candidate => `Tried ${candidate}`),
                "",
                "Install ts-node as a dev dependency for the integration tests/workspace.",
                "Do not rely on a global ts-node for these tests.",
            ].join("\n"),
        )
    }

    return found
}

export function defaultLaobanLaunch(): LaobanLaunch {
    return {
        command: process.execPath,
        args: [
            findTsNodeCli(),
            path.join(laobanExecutableDirectory, "index.ts"),
        ],
    }
}

function renderCommandLine(command: string, args: string[]): string {
    return [command, ...args].join(" ")
}

export async function runLaobanInFixture(
    options: RunLaobanInFixtureOptions,
): Promise<LaobanRunResult> {
    const launch = options.launch ?? defaultLaobanLaunch()
    const args = [
        ...launch.args,
        ...options.args,
    ]

    return new Promise((resolve, reject) => {
        const child = spawn(
            launch.command,
            args,
            {
                cwd: options.fixtureDir,
                env: {
                    ...process.env,
                    ...(options.env ?? {}),
                },
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            },
        )

        let stdout = ""
        let stderr = ""

        child.stdout.setEncoding("utf8")
        child.stderr.setEncoding("utf8")

        child.stdout.on("data", chunk => {
            stdout += chunk
        })

        child.stderr.on("data", chunk => {
            stderr += chunk
        })

        child.on("error", reject)

        child.on("close", code => {
            resolve({
                exitCode: code ?? 1,
                stdout,
                stderr,
                commandLine: renderCommandLine(launch.command, args),
                cwd: options.fixtureDir,
            })
        })
    })
}