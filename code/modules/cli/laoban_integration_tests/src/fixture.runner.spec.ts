import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import {
    defaultLaobanLaunch,
    runLaobanInFixture,
} from "./fixture.runner"

async function makeTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "laoban-fixture-runner-"))
}

async function mkdirp(dir: string): Promise<void> {
    await fs.mkdir(dir, {recursive: true})
}

async function writeFile(file: string, content: string): Promise<void> {
    await fs.writeFile(file, content)
}

describe("runLaobanInFixture", () => {
    let root: string
    let fixtureDir: string

    beforeEach(async () => {
        root = await makeTempRoot()
        fixtureDir = path.join(root, "fixture")
        await mkdirp(fixtureDir)
    })

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true})
    })

    function nodeLaunch(entryPoint: string) {
        return {
            command: process.execPath,
            args: [entryPoint],
        }
    }

    it("runs the supplied command in the fixture directory", async () => {
        const entryPoint = path.join(root, "fake-laoban.js")

        await writeFile(
            entryPoint,
            [
                "console.log(process.cwd())",
            ].join("\n"),
        )

        const actual = await runLaobanInFixture({
            fixtureDir,
            args: [],
            launch: nodeLaunch(entryPoint),
        })

        expect(actual.exitCode).toBe(0)
        expect(actual.stdout.trim()).toBe(fixtureDir)
        expect(actual.stderr).toBe("")
    })

    it("passes args after the launch args", async () => {
        const entryPoint = path.join(root, "fake-laoban.js")

        await writeFile(
            entryPoint,
            [
                "console.log(JSON.stringify(process.argv.slice(2)))",
            ].join("\n"),
        )

        const actual = await runLaobanInFixture({
            fixtureDir,
            args: ["packages", "list", "--debug"],
            launch: nodeLaunch(entryPoint),
        })

        expect(actual.exitCode).toBe(0)
        expect(actual.stdout.trim()).toBe(JSON.stringify([
            "packages",
            "list",
            "--debug",
        ]))
        expect(actual.stderr).toBe("")
    })

    it("captures stderr", async () => {
        const entryPoint = path.join(root, "fake-laoban.js")

        await writeFile(
            entryPoint,
            [
                "console.error('bad things')",
            ].join("\n"),
        )

        const actual = await runLaobanInFixture({
            fixtureDir,
            args: [],
            launch: nodeLaunch(entryPoint),
        })

        expect(actual.exitCode).toBe(0)
        expect(actual.stdout).toBe("")
        expect(actual.stderr.trim()).toBe("bad things")
    })

    it("returns the child process exit code", async () => {
        const entryPoint = path.join(root, "fake-laoban.js")

        await writeFile(
            entryPoint,
            [
                "process.exit(7)",
            ].join("\n"),
        )

        const actual = await runLaobanInFixture({
            fixtureDir,
            args: [],
            launch: nodeLaunch(entryPoint),
        })

        expect(actual.exitCode).toBe(7)
        expect(actual.stdout).toBe("")
        expect(actual.stderr).toBe("")
    })

    it("merges supplied env with process.env", async () => {
        const entryPoint = path.join(root, "fake-laoban.js")

        await writeFile(
            entryPoint,
            [
                "console.log(process.env.TEST_LAOBAN_ENV)",
            ].join("\n"),
        )

        const actual = await runLaobanInFixture({
            fixtureDir,
            args: [],
            env: {
                TEST_LAOBAN_ENV: "hello",
            },
            launch: nodeLaunch(entryPoint),
        })

        expect(actual.exitCode).toBe(0)
        expect(actual.stdout.trim()).toBe("hello")
        expect(actual.stderr).toBe("")
    })

    it("supports launch args before fixture args", async () => {
        const preload = path.join(root, "preload.js")
        const entryPoint = path.join(root, "fake-laoban.js")

        await writeFile(
            preload,
            [
                "globalThis.__PRELOADED__ = 'yes'",
            ].join("\n"),
        )

        await writeFile(
            entryPoint,
            [
                "console.log(globalThis.__PRELOADED__)",
            ].join("\n"),
        )

        const actual = await runLaobanInFixture({
            fixtureDir,
            args: [],
            launch: {
                command: process.execPath,
                args: ["--require", preload, entryPoint],
            },
        })

        expect(actual.exitCode).toBe(0)
        expect(actual.stdout.trim()).toBe("yes")
        expect(actual.stderr).toBe("")
    })

    it("resolves with a non-zero exit code when node cannot load the script", async () => {
        const actual = await runLaobanInFixture({
            fixtureDir,
            args: [],
            launch: {
                command: process.execPath,
                args: [path.join(root, "missing.js")],
            },
        })

        expect(actual.exitCode).not.toBe(0)
        expect(actual.stdout).toBe("")
        expect(actual.stderr).toContain("Cannot find module")
    })
})

describe("defaultLaobanLaunch", () => {
    it("uses yarn ts-node and the index.ts from the Laoban executable directory", () => {
        const launch = defaultLaobanLaunch()

        expect(launch.command).toEqual("yarn")

        expect(launch.args.map(arg => arg.replace(/\\/g, "/"))).toEqual([
            "ts-node",
            expect.stringMatching(/code\/modules\/cli\/laoban\/index\.ts$/),
        ])
    })
})