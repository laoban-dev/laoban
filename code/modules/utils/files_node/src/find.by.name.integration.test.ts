import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

import {isErrors, valueOrThrow} from "@laoban/errors"
import {type FileOpIssue, findAllByNameUnder as makeFindAllByNameUnder} from "@laoban/files"

import {nodeFileOpsDefaults} from "./fileops.node.defaults"

const nodeFindAllByNameUnder =
    makeFindAllByNameUnder(nodeFileOpsDefaults.findAllByNameUnder)

const makeTempDir = async (): Promise<string> =>
    fs.mkdtemp(path.join(os.tmpdir(), "find-by-name-node-"))

const writeFile = async (filename: string, content = ""): Promise<void> => {
    await fs.mkdir(path.dirname(filename), {recursive: true})
    await fs.writeFile(filename, content, "utf8")
}

const mkdir = async (dirname: string): Promise<void> => {
    await fs.mkdir(dirname, {recursive: true})
}

const withoutCause = (issue: FileOpIssue): FileOpIssue => {
    if (issue.context === undefined) return issue

    const {cause: _cause, ...context} = issue.context

    return {
        ...issue,
        context,
    }
}

describe("nodeFindAllByNameUnder", () => {
    let root: string

    beforeEach(async () => {
        root = await makeTempDir()
    })

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true})
    })

    it("finds matching files recursively and returns full paths in deterministic order", async () => {
        await writeFile(path.join(root, "packages", "b", "package.details.json"), "{}")
        await writeFile(path.join(root, "packages", "a", "package.details.json"), "{}")
        await writeFile(path.join(root, "packages", "a", "src", "package.details.json"), "{}")
        await writeFile(path.join(root, "packages", "a", "src", "other.txt"), "x")

        const result = await nodeFindAllByNameUnder(root, "package.details.json")

        expect(isErrors(result)).toBe(false)
        expect(valueOrThrow(result)).toEqual([
            path.join(root, "packages", "a", "package.details.json"),
            path.join(root, "packages", "a", "src", "package.details.json"),
            path.join(root, "packages", "b", "package.details.json"),
        ])
    })

    it("ignores .git and node_modules by default", async () => {
        await writeFile(path.join(root, "packages", "a", "package.details.json"), "{}")
        await writeFile(path.join(root, ".git", "hidden", "package.details.json"), "{}")
        await writeFile(path.join(root, "node_modules", "dep", "package.details.json"), "{}")

        const result = await nodeFindAllByNameUnder(root, "package.details.json")

        expect(isErrors(result)).toBe(false)
        expect(valueOrThrow(result)).toEqual([
            path.join(root, "packages", "a", "package.details.json"),
        ])
    })

    it("allows ignoreDirectories to be overridden", async () => {
        await writeFile(path.join(root, "packages", "a", "package.details.json"), "{}")
        await writeFile(path.join(root, "node_modules", "dep", "package.details.json"), "{}")

        const result = await nodeFindAllByNameUnder(root, "package.details.json", {
            ignoreDirectories: [],
        })

        expect(isErrors(result)).toBe(false)
        expect(valueOrThrow(result)).toEqual([
            path.join(root, "node_modules", "dep", "package.details.json"),
            path.join(root, "packages", "a", "package.details.json"),
        ])
    })

    it("returns an empty array when there are no matches", async () => {
        await mkdir(path.join(root, "packages", "a", "src"))
        await writeFile(path.join(root, "packages", "a", "src", "index.ts"), "export {};")

        const result = await nodeFindAllByNameUnder(root, "package.details.json")

        expect(isErrors(result)).toBe(false)
        expect(valueOrThrow(result)).toEqual([])
    })

    it("returns an error when the root directory does not exist", async () => {
        const missing = path.join(root, "does-not-exist")

        const result = await nodeFindAllByNameUnder(missing, "package.details.json")

        expect(isErrors(result)).toBe(true)

        if (isErrors(result)) {
            expect(result.errors.map(withoutCause)).toEqual([
                {
                    kind: "notFound",
                    message: `Failed listing directory [${missing}]`,
                    severity: "error",
                    code: "ENOENT",
                    context: {
                        operation: "listDirectory",
                    },
                    diagnosticContext: {
                        currentFile: missing,
                    },
                },
            ])
        }
    })

    it("returns invalidPath when the root is a file", async () => {
        const file = path.join(root, "plain-file.txt")
        await writeFile(file, "hello")

        const result = await nodeFindAllByNameUnder(file, "package.details.json")

        expect(isErrors(result)).toBe(true)

        if (isErrors(result)) {
            expect(result.errors.map(withoutCause)).toEqual([
                {
                    kind: "invalidPath",
                    message: `Failed listing directory [${file}]`,
                    severity: "error",
                    code: "ENOTDIR",
                    context: {
                        operation: "listDirectory",
                    },
                    diagnosticContext: {
                        currentFile: file,
                    },
                },
            ])
        }
    })

    it("does not treat ordinary files as directories during traversal", async () => {
        await writeFile(path.join(root, "packages", "a", "package.details.json"), "{}")
        await writeFile(path.join(root, "packages", "plain-file.txt"), "hello")

        const result = await nodeFindAllByNameUnder(root, "package.details.json")

        expect(isErrors(result)).toBe(false)
        expect(valueOrThrow(result)).toEqual([
            path.join(root, "packages", "a", "package.details.json"),
        ])
    })
})