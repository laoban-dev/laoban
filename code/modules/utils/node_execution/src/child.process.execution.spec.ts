// execution.childprocess.spec.ts

import {Writable} from "node:stream"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {executeChildProcess} from "./child.process.execution"

class RecordingWritable extends Writable {
    public writes: string[] = []

    _write(
        chunk: Buffer | string,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void
    ): void {
        this.writes.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk))
        callback()
    }

    text(): string {
        return this.writes.join("")
    }
}

function testObservability() {
    const logs: unknown[][] = []
    const debugCalls: unknown[][] = []

    return {
        logs,
        debugCalls,
        observability: {
            correlationId: "test",
            module: "test-module",
            debugLevels: {},
            timeService: {now: () => 0},
            templates: {},
            dictionary: {},
            log: (...msg: unknown[]) => logs.push(msg),
            debug: (...msg: unknown[]) => debugCalls.push(msg),
            countMetric: jest.fn(),
            durationMetric: jest.fn()
        } as any
    }
}

async function withTempDir<T>(block: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laoban-child-process-"))
    try {
        return await block(dir)
    } finally {
        await fs.rm(dir, {recursive: true, force: true})
    }
}

describe("executeChildProcess", () => {
    it("pipes stdout to the supplied writable", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.stdout.write('hello')"`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).toEqual(0)
        expect(writable.text()).toEqual("hello")
    })

    it("pipes stderr to the same supplied writable", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.stderr.write('bad')"`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).toEqual(0)
        expect(writable.text()).toEqual("bad")
    })

    it("pipes stdout and stderr to the same supplied writable", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.stdout.write('out'); process.stderr.write('err')"`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).toEqual(0)

        // stdout/stderr are separate OS pipes, so chunk interleaving is not a
        // contractual guarantee. We only assert both streams land in the same writable.
        expect(writable.text()).toContain("out")
        expect(writable.text()).toContain("err")
    })

    it("returns the process exit code", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.exit(7)"`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).toEqual(7)
    })

    it("runs the command in the supplied cwd", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            const {observability} = testObservability()

            const exitCode = await executeChildProcess(
                `node -e "process.stdout.write(process.cwd())"`,
                dir,
                {},
                writable,
                observability
            )

            expect(exitCode).toEqual(0)
            expect(path.resolve(writable.text())).toEqual(path.resolve(dir))
        })
    })

    it("passes env values to the process", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.stdout.write(process.env.LAOBAN_TEST_VALUE || '')"`,
            process.cwd(),
            {LAOBAN_TEST_VALUE: "hello-env"},
            writable,
            observability
        )

        expect(exitCode).toEqual(0)
        expect(writable.text()).toEqual("hello-env")
    })

    it("merges supplied env values with process.env", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.stdout.write(process.env.PATH ? 'has-path' : 'missing-path')"`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).toEqual(0)
        expect(writable.text()).toEqual("has-path")
    })

    it("logs debug information before spawning", async () => {
        const writable = new RecordingWritable()
        const {observability, debugCalls} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.stdout.write('hello')"`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).toEqual(0)
        expect(debugCalls).toHaveLength(1)
        expect(debugCalls[0][0]).toEqual(["execution"])
        expect(debugCalls[0][1]).toEqual("debug")
        expect(debugCalls[0][2]).toEqual("spawning")
        expect(debugCalls[0][3]).toMatchObject({
            command: `node -e "process.stdout.write('hello')"`,
            cwd: process.cwd()
        })
    })

    it("returns a non-zero exit code for a failing command", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `node -e "process.exit(3)"`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).toEqual(3)
    })

    it("returns the shell failure exit code for a missing command", async () => {
        const writable = new RecordingWritable()
        const {observability} = testObservability()

        const exitCode = await executeChildProcess(
            `definitely-not-a-real-command-for-laoban-tests`,
            process.cwd(),
            {},
            writable,
            observability
        )

        expect(exitCode).not.toEqual(0)
        expect(writable.text().length).toBeGreaterThan(0)
    })
})