// file.executor.spec.ts

import {Writable} from "node:stream"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import {
    cat,
    cp,
    exists,
    existsPath,
    isDirectory,
    isFile,
    makeFileExecutor,
    mkdir,
    pwd,
    requireArg,
    requireArgCount,
    requireArgCountBetween,
    resolveInCwd,
    rm,
    rmDir,
    tail,
    writeString
} from "./file.execution"

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
}

class FailingWritable {
    write(
        _chunk: string,
        callback?: (error?: Error | null) => void
    ): boolean {
        callback?.(new Error("write failed"))
        return false
    }
}

async function withTempDir<T>(block: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "laoban-file-executor-"))
    try {
        return await block(dir)
    } finally {
        await fs.rm(dir, {recursive: true, force: true})
    }
}

async function read(fileName: string): Promise<string> {
    return fs.readFile(fileName, "utf8")
}

describe("writeString", () => {
    it("writes text to the supplied writable", async () => {
        const writable = new RecordingWritable()

        await writeString(writable, "hello")

        expect(writable.writes).toEqual(["hello"])
    })

    it("rejects when the writable reports an error", async () => {
        await expect(writeString(new FailingWritable() as any, "hello"))
            .rejects
            .toThrow("write failed")
    })
})

describe("resolveInCwd", () => {
    it("resolves relative paths against cwd", () => {
        expect(resolveInCwd("/workspace/pkg", "dist/out.txt"))
            .toEqual(path.join("/workspace/pkg", "dist/out.txt"))
    })

    it("leaves absolute paths unchanged", () => {
        const absolute = path.resolve("/tmp/example.txt")

        expect(resolveInCwd("/workspace/pkg", absolute)).toEqual(absolute)
    })
})

describe("path predicates", () => {
    it("detects existing paths, files and directories", async () => {
        await withTempDir(async dir => {
            const fileName = path.join(dir, "file.txt")
            const childDir = path.join(dir, "child")

            await fs.writeFile(fileName, "hello")
            await fs.mkdir(childDir)

            expect(await existsPath(fileName)).toEqual(true)
            expect(await existsPath(childDir)).toEqual(true)
            expect(await existsPath(path.join(dir, "missing"))).toEqual(false)

            expect(await isFile(fileName)).toEqual(true)
            expect(await isFile(childDir)).toEqual(false)
            expect(await isFile(path.join(dir, "missing"))).toEqual(false)

            expect(await isDirectory(childDir)).toEqual(true)
            expect(await isDirectory(fileName)).toEqual(false)
            expect(await isDirectory(path.join(dir, "missing"))).toEqual(false)
        })
    })
})

describe("argument validation", () => {
    it("returns a required argument", () => {
        expect(requireArg("cp", ["a", "b"], 1)).toEqual("b")
    })

    it("throws when a required argument is missing", () => {
        expect(() => requireArg("cp", ["a"], 1))
            .toThrow("file:cp requires argument 2")
    })

    it("throws when a required argument is empty", () => {
        expect(() => requireArg("cp", [""], 0))
            .toThrow("file:cp requires argument 1")
    })

    it("accepts the exact required argument count", () => {
        expect(() => requireArgCount("cp", ["a", "b"], 2)).not.toThrow()
    })

    it("throws when the argument count is wrong", () => {
        expect(() => requireArgCount("cp", ["a", "b", "c"], 2))
            .toThrow("file:cp requires 2 argument(s). Got 3")
    })

    it("accepts an argument count in range", () => {
        expect(() => requireArgCountBetween("tail", ["a"], 1, 2)).not.toThrow()
        expect(() => requireArgCountBetween("tail", ["a", "10"], 1, 2)).not.toThrow()
    })

    it("throws when the argument count is below range", () => {
        expect(() => requireArgCountBetween("tail", [], 1, 2))
            .toThrow("file:tail requires between 1 and 2 argument(s). Got 0")
    })

    it("throws when the argument count is above range", () => {
        expect(() => requireArgCountBetween("tail", ["a", "10", "extra"], 1, 2))
            .toThrow("file:tail requires between 1 and 2 argument(s). Got 3")
    })
})

describe("file command functions", () => {
    it("pwd writes the current working directory with a newline", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()

            const exitCode = await pwd(dir, [], {}, writable)

            expect(exitCode).toEqual(0)
            expect(writable.writes.join("")).toEqual(`${dir}\n`)
        })
    })

    it("exists writes true for existing paths and false for missing paths", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            await fs.writeFile(path.join(dir, "file.txt"), "hello")

            expect(await exists(dir, ["file.txt"], {}, writable)).toEqual(0)
            expect(await exists(dir, ["missing.txt"], {}, writable)).toEqual(0)

            expect(writable.writes.join("")).toEqual("true\nfalse\n")
        })
    })

    it("mkdir creates a directory recursively", async () => {
        await withTempDir(async dir => {
            const target = path.join(dir, "a", "b")

            const exitCode = await mkdir(dir, ["a/b"], {}, new RecordingWritable())

            expect(exitCode).toEqual(0)
            expect(await isDirectory(target)).toEqual(true)
        })
    })

    it("rm removes files", async () => {
        await withTempDir(async dir => {
            const fileName = path.join(dir, "file.txt")
            await fs.writeFile(fileName, "hello")

            const exitCode = await rm(dir, ["file.txt"], {}, new RecordingWritable())

            expect(exitCode).toEqual(0)
            expect(await existsPath(fileName)).toEqual(false)
        })
    })

    it("rm ignores missing files", async () => {
        await withTempDir(async dir => {
            const exitCode = await rm(dir, ["missing.txt"], {}, new RecordingWritable())

            expect(exitCode).toEqual(0)
        })
    })

    it("rm does not remove directories", async () => {
        await withTempDir(async dir => {
            await fs.mkdir(path.join(dir, "child"))

            const exitCode = await rm(dir, ["child"], {}, new RecordingWritable())

            expect(exitCode).toEqual(0)
            expect(await isDirectory(path.join(dir, "child"))).toEqual(true)
        })
    })

    it("rmDir removes directories recursively", async () => {
        await withTempDir(async dir => {
            const child = path.join(dir, "child")
            await fs.mkdir(child)
            await fs.writeFile(path.join(child, "file.txt"), "hello")

            const exitCode = await rmDir(dir, ["child"], {}, new RecordingWritable())

            expect(exitCode).toEqual(0)
            expect(await existsPath(child)).toEqual(false)
        })
    })

    it("rmDir ignores missing directories", async () => {
        await withTempDir(async dir => {
            const exitCode = await rmDir(dir, ["missing"], {}, new RecordingWritable())

            expect(exitCode).toEqual(0)
        })
    })

    it("cat writes file contents", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            await fs.writeFile(path.join(dir, "file.txt"), "hello")

            const exitCode = await cat(dir, ["file.txt"], {}, writable)

            expect(exitCode).toEqual(0)
            expect(writable.writes.join("")).toEqual("hello")
        })
    })

    it("cat ignores missing files", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()

            const exitCode = await cat(dir, ["missing.txt"], {}, writable)

            expect(exitCode).toEqual(0)
            expect(writable.writes.join("")).toEqual("")
        })
    })

    it("tail writes the last 10 lines by default", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            const lines = Array.from({length: 12}, (_, i) => `line-${i + 1}`)
            await fs.writeFile(path.join(dir, "file.txt"), lines.join("\n"))

            const exitCode = await tail(dir, ["file.txt"], {}, writable)

            expect(exitCode).toEqual(0)
            expect(writable.writes.join("")).toEqual(lines.slice(-10).join("\n"))
        })
    })

    it("tail writes the requested number of lines", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            await fs.writeFile(path.join(dir, "file.txt"), "a\nb\nc\nd")

            const exitCode = await tail(dir, ["file.txt", "2"], {}, writable)

            expect(exitCode).toEqual(0)
            expect(writable.writes.join("")).toEqual("c\nd")
        })
    })

    it("tail allows zero lines", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            await fs.writeFile(path.join(dir, "file.txt"), "a\nb\nc")

            const exitCode = await tail(dir, ["file.txt", "0"], {}, writable)

            expect(exitCode).toEqual(0)
            expect(writable.writes.join("")).toEqual("")
        })
    })

    it("tail throws for a malformed tail size", async () => {
        await withTempDir(async dir => {
            await fs.writeFile(path.join(dir, "file.txt"), "a\nb\nc")

            await expect(tail(dir, ["file.txt", "banana"], {}, new RecordingWritable()))
                .rejects
                .toThrow("file:tail argument 2 must be a non-negative integer. Was [banana]")
        })
    })

    it("tail throws for a negative tail size", async () => {
        await withTempDir(async dir => {
            await fs.writeFile(path.join(dir, "file.txt"), "a\nb\nc")

            await expect(tail(dir, ["file.txt", "-1"], {}, new RecordingWritable()))
                .rejects
                .toThrow("file:tail argument 2 must be a non-negative integer. Was [-1]")
        })
    })

    it("tail ignores missing files", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()

            const exitCode = await tail(dir, ["missing.txt"], {}, writable)

            expect(exitCode).toEqual(0)
            expect(writable.writes.join("")).toEqual("")
        })
    })

    it("cp copies a file and creates the target directory", async () => {
        await withTempDir(async dir => {
            await fs.writeFile(path.join(dir, "source.json"), `{"ok":true}`)

            const exitCode = await cp(dir, ["source.json", "nested/target.json"], {}, new RecordingWritable())

            expect(exitCode).toEqual(0)
            expect(await read(path.join(dir, "nested", "target.json"))).toEqual(`{"ok":true}`)
        })
    })

    it("cp supports absolute target paths", async () => {
        await withTempDir(async sourceDir => {
            await withTempDir(async targetDir => {
                await fs.writeFile(path.join(sourceDir, "source.txt"), "hello")
                const target = path.join(targetDir, "out.txt")

                const exitCode = await cp(sourceDir, ["source.txt", target], {}, new RecordingWritable())

                expect(exitCode).toEqual(0)
                expect(await read(target)).toEqual("hello")
            })
        })
    })

    it("cp throws when the source file is missing", async () => {
        await withTempDir(async dir => {
            await expect(cp(dir, ["missing.txt", "target.txt"], {}, new RecordingWritable()))
                .rejects
                .toThrow()
        })
    })
})

describe("makeFileExecutor", () => {
    it("parses and dispatches to the named file command", async () => {
        const calls: Array<{
            cwd: string
            args: string[]
            env: Record<string, string>
            writable: RecordingWritable
        }> = []

        const writable = new RecordingWritable()
        const executor = makeFileExecutor({
            custom: async (cwd, args, env, writableArg) => {
                calls.push({cwd, args, env, writable: writableArg as RecordingWritable})
                return 7
            }
        })

        const exitCode = await executor(
            "custom(a,b)",
            "/workspace/pkg",
            {HELLO: "world"},
            writable,
            {} as any
        )

        expect(exitCode).toEqual(7)
        expect(calls).toEqual([
            {
                cwd: "/workspace/pkg",
                args: ["a", "b"],
                env: {HELLO: "world"},
                writable
            }
        ])
    })

    it("supports default file commands through the executor", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            const executor = makeFileExecutor()

            const exitCode = await executor(
                "mkdir(dist)",
                dir,
                {},
                writable,
                {} as any
            )

            expect(exitCode).toEqual(0)
            expect(await isDirectory(path.join(dir, "dist"))).toEqual(true)
        })
    })

    it("supports cp through the executor", async () => {
        await withTempDir(async dir => {
            const writable = new RecordingWritable()
            const executor = makeFileExecutor()

            await fs.writeFile(path.join(dir, "coverage-final.json"), `{"covered":true}`)

            const exitCode = await executor(
                "cp(coverage-final.json,coverage/pkg.name.json)",
                dir,
                {},
                writable,
                {} as any
            )

            expect(exitCode).toEqual(0)
            expect(await read(path.join(dir, "coverage", "pkg.name.json")))
                .toEqual(`{"covered":true}`)
        })
    })

    it("throws for unknown file commands", async () => {
        const executor = makeFileExecutor({
            known: async () => 0
        })

        await expect(executor(
            "unknown(a)",
            "/workspace/pkg",
            {},
            new RecordingWritable(),
            {} as any
        )).rejects.toThrow("Unknown file command unknown. Known commands are known")
    })

    it("throws for malformed file command syntax", async () => {
        const executor = makeFileExecutor()

        await expect(executor(
            "mkdir",
            "/workspace/pkg",
            {},
            new RecordingWritable(),
            {} as any
        )).rejects.toThrow("Command [mkdir] does not match name(arg1,arg2,...)")
    })
})