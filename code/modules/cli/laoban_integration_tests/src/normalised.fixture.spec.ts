import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import {
    expectedLines, isIgnorableOutputLine,
    normaliseSlashes,
    toArrayReplacingRoot,
} from "./normalised.fixture"

async function makeTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "laoban-normalised-fixture-"))
}

describe("normaliseSlashes", () => {
    it("replaces backslashes with forward slashes", () => {
        expect(normaliseSlashes("a\\b\\c")).toEqual("a/b/c")
    })

    it("leaves forward slashes alone", () => {
        expect(normaliseSlashes("a/b/c")).toEqual("a/b/c")
    })

    it("handles mixed slashes", () => {
        expect(normaliseSlashes("a\\b/c\\d")).toEqual("a/b/c/d")
    })
})

describe("toArrayReplacingRoot", () => {
    let root: string

    beforeEach(async () => {
        root = await makeTempRoot()
    })

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true})
    })

    it("replaces the resolved root with <root>", () => {
        const text = path.join(root, "packages", "alpha")

        expect(toArrayReplacingRoot(root, text)).toEqual([
            "<root>/packages/alpha",
        ])
    })

    it("replaces every occurrence of the resolved root", () => {
        const text = [
            path.join(root, "packages", "alpha"),
            path.join(root, "packages", "beta"),
        ].join("\n")

        expect(toArrayReplacingRoot(root, text)).toEqual([
            "<root>/packages/alpha",
            "<root>/packages/beta",
        ])
    })

    it("normalises slashes before replacing root", () => {
        const text = path.join(root, "packages", "alpha").replace(/\\/g, "/")

        expect(toArrayReplacingRoot(root, text)).toEqual([
            "<root>/packages/alpha",
        ])
    })

    it("normalises CRLF line endings", () => {
        const text = [
            path.join(root, "alpha"),
            path.join(root, "beta"),
            path.join(root, "gamma"),
        ].join("\r\n")

        expect(toArrayReplacingRoot(root, text)).toEqual([
            "<root>/alpha",
            "<root>/beta",
            "<root>/gamma",
        ])
    })

    it("normalises CR line endings", () => {
        const text = [
            path.join(root, "alpha"),
            path.join(root, "beta"),
            path.join(root, "gamma"),
        ].join("\r")

        expect(toArrayReplacingRoot(root, text)).toEqual([
            "<root>/alpha",
            "<root>/beta",
            "<root>/gamma",
        ])
    })

    it("preserves interior blank lines", () => {
        const text = `${path.join(root, "alpha")}\n\n${path.join(root, "beta")}\n`

        expect(toArrayReplacingRoot(root, text)).toEqual([
            "<root>/alpha",
            "",
            "<root>/beta",
        ])
    })

    it("removes trailing final newlines", () => {
        const text = `${path.join(root, "alpha")}\n${path.join(root, "beta")}\n\n`

        expect(toArrayReplacingRoot(root, text)).toEqual([
            "<root>/alpha",
            "<root>/beta",
        ])
    })

    it("returns an empty array for empty output", () => {
        expect(toArrayReplacingRoot(root, "")).toEqual([])
    })

    it("returns an empty array for whitespace-only trailing newlines", () => {
        expect(toArrayReplacingRoot(root, "\n\n")).toEqual([])
    })

    it("does not require the text to contain the root", () => {
        expect(toArrayReplacingRoot(root, "hello\nworld")).toEqual([
            "hello",
            "world",
        ])
    })
})

describe("expectedLines", () => {
    let root: string
    let fixtureRoot: string
    let fixtureDir: string

    beforeEach(async () => {
        root = await makeTempRoot()
        fixtureRoot = path.join(root, "config")
        fixtureDir = path.join(fixtureRoot, "simple")

        await fs.mkdir(fixtureDir, {recursive: true})
    })

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true})
    })

    it("reads the expected file and normalises it", async () => {
        await fs.writeFile(
            path.join(fixtureDir, "expectedPackages.txt"),
            `${path.join(fixtureRoot, "simple", "alpha")}\n`,
        )

        expect(expectedLines(
            fixtureRoot,
            fixtureDir,
            "expectedPackages.txt",
        )).toEqual([
            "<root>/simple/alpha",
        ])
    })

    it("uses fixtureDir to find the expected file", async () => {
        await fs.writeFile(
            path.join(fixtureDir, "expectedConfig.txt"),
            "config output\n",
        )

        expect(expectedLines(
            fixtureRoot,
            fixtureDir,
            "expectedConfig.txt",
        )).toEqual([
            "config output",
        ])
    })

    it("throws when the expected file does not exist", () => {
        expect(() => expectedLines(
            fixtureRoot,
            fixtureDir,
            "missing.txt",
        )).toThrow()
    })
})
describe("isIgnorableOutputLine", () => {
    it("ignores Node DEP0128 invalid main field warnings", () => {
        expect(isIgnorableOutputLine(
            "(node:26940) [DEP0128] DeprecationWarning: Invalid 'main' field in '//?/C:/git/laoban/code/node_modules/@laoban/errors/package.json' of 'dist/index'. Please either fix that or report it to the module author",
        )).toBe(true)
    })

    it("ignores the node trace-deprecation hint line", () => {
        expect(isIgnorableOutputLine(
            "(Use `node --trace-deprecation ...` to show where the warning was created)",
        )).toBe(true)
    })

    it("does not ignore real CLI output", () => {
        expect(isIgnorableOutputLine(
            "projects/project1 => proj1 (typescript)",
        )).toBe(false)
    })
})
