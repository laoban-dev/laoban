import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import {
    findFixtureRoot,
    fixtureDirectoriesUnder,
    forEachDirectory,
    FixtureDirectory, findLaobanExecutableDirectory,
} from "./fixture.directories"

async function makeTempRoot(): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), "laoban-fixture-directories-"))
}

async function mkdirp(dir: string): Promise<void> {
    await fs.mkdir(dir, {recursive: true})
}

async function writeFile(file: string, content = ""): Promise<void> {
    await fs.writeFile(file, content)
}

describe("findFixtureRoot", () => {
    let root: string
    let originalCwd: string

    beforeEach(async () => {
        root = await makeTempRoot()
        originalCwd = process.cwd()
    })

    afterEach(async () => {
        process.chdir(originalCwd)
        await fs.rm(root, {recursive: true, force: true})
    })

    it("finds tests when start is the laoban directory", async () => {
        const laobanDir = path.join(root, "laoban")
        const testsDir = path.join(laobanDir, "tests")

        await mkdirp(testsDir)

        expect(findFixtureRoot({start: laobanDir})).toEqual(testsDir)
    })

    it("walks upward from a child directory until it finds laoban/tests", async () => {
        const laobanDir = path.join(root, "laoban")
        const testsDir = path.join(laobanDir, "tests")
        const start = path.join(laobanDir, "code", "modules", "integration_tests", "src")

        await mkdirp(testsDir)
        await mkdirp(start)

        expect(findFixtureRoot({start})).toEqual(testsDir)
    })

    it("uses process.cwd() when start is not supplied", async () => {
        const laobanDir = path.join(root, "laoban")
        const testsDir = path.join(laobanDir, "tests")
        const cwd = path.join(laobanDir, "code", "modules", "integration_tests")

        await mkdirp(testsDir)
        await mkdirp(cwd)

        process.chdir(cwd)

        expect(findFixtureRoot()).toEqual(testsDir)
    })

    it("requires the matching directory itself to be called laoban", async () => {
        const notLaobanDir = path.join(root, "not-laoban")
        const testsDir = path.join(notLaobanDir, "tests")
        const start = path.join(notLaobanDir, "src")

        await mkdirp(testsDir)
        await mkdirp(start)

        expect(() => findFixtureRoot({start})).toThrow()
    })

    it("requires the laoban directory to contain tests", async () => {
        const laobanDir = path.join(root, "laoban")
        const start = path.join(laobanDir, "src")

        await mkdirp(start)

        expect(() => findFixtureRoot({start})).toThrow()
    })

    it("supports custom root and fixture directory names", async () => {
        const rootDir = path.join(root, "custom-root")
        const fixtureRoot = path.join(rootDir, "fixtures")
        const start = path.join(rootDir, "src")

        await mkdirp(fixtureRoot)
        await mkdirp(start)

        expect(findFixtureRoot({
            start,
            rootDirectoryName: "custom-root",
            fixtureDirectoryName: "fixtures",
        })).toEqual(fixtureRoot)
    })
})

describe("fixtureDirectoriesUnder", () => {
    let root: string

    beforeEach(async () => {
        root = await makeTempRoot()
    })

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true})
    })

    it("returns one fixture entry for each directory directly under the named directory", async () => {
        await mkdirp(path.join(root, "config", "alpha"))
        await mkdirp(path.join(root, "config", "beta"))
        await writeFile(path.join(root, "config", "not-a-directory.txt"))

        const actual = fixtureDirectoriesUnder(root, "config")

        expect(actual).toEqual([
            {
                fixtureRoot: path.join(root, "config"),
                fixtureName: "alpha",
                fixtureDir: path.join(root, "config", "alpha"),
            },
            {
                fixtureRoot: path.join(root, "config"),
                fixtureName: "beta",
                fixtureDir: path.join(root, "config", "beta"),
            },
        ])
    })

    it("sorts fixtures by directory name", async () => {
        await mkdirp(path.join(root, "config", "zeta"))
        await mkdirp(path.join(root, "config", "alpha"))
        await mkdirp(path.join(root, "config", "middle"))

        const actual = fixtureDirectoriesUnder(root, "config")

        expect(actual.map(fixture => fixture.fixtureName)).toEqual([
            "alpha",
            "middle",
            "zeta",
        ])
    })

    it("does not recurse into nested directories", async () => {
        await mkdirp(path.join(root, "config", "alpha", "nested"))
        await mkdirp(path.join(root, "config", "beta"))

        const actual = fixtureDirectoriesUnder(root, "config")

        expect(actual.map(fixture => fixture.fixtureName)).toEqual([
            "alpha",
            "beta",
        ])
    })

    it("uses root plus namedDirectory as the fixture root", async () => {
        await mkdirp(path.join(root, "observability", "simple"))

        const actual = fixtureDirectoriesUnder(root, "observability")

        expect(actual).toEqual([
            {
                fixtureRoot: path.join(root, "observability"),
                fixtureName: "simple",
                fixtureDir: path.join(root, "observability", "simple"),
            },
        ])
    })

    it("throws when the named directory does not exist", () => {
        expect(() => fixtureDirectoriesUnder(root, "missing")).toThrow()
    })
})

describe("forEachDirectory", () => {
    let root: string

    beforeEach(async () => {
        root = await makeTempRoot()
    })

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true})
    })

    it("calls the callback once for each fixture directory in sorted order", async () => {
        await mkdirp(path.join(root, "config", "zeta"))
        await mkdirp(path.join(root, "config", "alpha"))
        await mkdirp(path.join(root, "config", "middle"))

        const actual: FixtureDirectory[] = []

        forEachDirectory(root, "config", directory => {
            actual.push(directory)
        })

        expect(actual).toEqual([
            {
                fixtureRoot: path.join(root, "config"),
                fixtureName: "alpha",
                fixtureDir: path.join(root, "config", "alpha"),
            },
            {
                fixtureRoot: path.join(root, "config"),
                fixtureName: "middle",
                fixtureDir: path.join(root, "config", "middle"),
            },
            {
                fixtureRoot: path.join(root, "config"),
                fixtureName: "zeta",
                fixtureDir: path.join(root, "config", "zeta"),
            },
        ])
    })

    it("does not call the callback for files", async () => {
        await mkdirp(path.join(root, "config", "alpha"))
        await writeFile(path.join(root, "config", "expectedPackages.txt"))

        const actual: string[] = []

        forEachDirectory(root, "config", directory => {
            actual.push(directory.fixtureName)
        })

        expect(actual).toEqual(["alpha"])
    })
})

describe("findLaobanExecutableDirectory", () => {
    let root: string
    let originalCwd: string

    beforeEach(async () => {
        root = await makeTempRoot()
        originalCwd = process.cwd()
    })

    afterEach(async () => {
        process.chdir(originalCwd)
        await fs.rm(root, {recursive: true, force: true})
    })

    it("finds code/modules/cli/laoban when laoban/tests and index.ts exist", async () => {
        const laobanRoot = path.join(root, "laoban")
        const testsDir = path.join(laobanRoot, "tests")
        const executableDir = path.join(
            laobanRoot,
            "code",
            "modules",
            "cli",
            "laoban",
        )
        const start = path.join(
            laobanRoot,
            "code",
            "modules",
            "cli",
            "laoban_integration_tests",
            "src",
        )

        await mkdirp(testsDir)
        await mkdirp(executableDir)
        await mkdirp(start)
        await writeFile(path.join(executableDir, "index.ts"), "export {}\n")

        expect(findLaobanExecutableDirectory({start})).toEqual(executableDir)
    })

    it("uses process.cwd when start is not supplied", async () => {
        const laobanRoot = path.join(root, "laoban")
        const testsDir = path.join(laobanRoot, "tests")
        const executableDir = path.join(
            laobanRoot,
            "code",
            "modules",
            "cli",
            "laoban",
        )
        const cwd = path.join(
            laobanRoot,
            "code",
            "modules",
            "cli",
            "laoban_integration_tests",
        )

        await mkdirp(testsDir)
        await mkdirp(executableDir)
        await mkdirp(cwd)
        await writeFile(path.join(executableDir, "index.ts"), "export {}\n")

        process.chdir(cwd)

        expect(findLaobanExecutableDirectory()).toEqual(executableDir)
    })

    it("throws when the executable directory does not exist", async () => {
        const laobanRoot = path.join(root, "laoban")
        const testsDir = path.join(laobanRoot, "tests")
        const start = path.join(laobanRoot, "code", "modules", "cli", "laoban_integration_tests")

        await mkdirp(testsDir)
        await mkdirp(start)

        expect(() => findLaobanExecutableDirectory({start})).toThrow(
            `Cannot find Laoban executable directory at ${path.join(
                laobanRoot,
                "code",
                "modules",
                "cli",
                "laoban",
            )}`,
        )
    })

    it("throws when index.ts does not exist in the executable directory", async () => {
        const laobanRoot = path.join(root, "laoban")
        const testsDir = path.join(laobanRoot, "tests")
        const executableDir = path.join(
            laobanRoot,
            "code",
            "modules",
            "cli",
            "laoban",
        )
        const start = path.join(laobanRoot, "code", "modules", "cli", "laoban_integration_tests")

        await mkdirp(testsDir)
        await mkdirp(executableDir)
        await mkdirp(start)

        expect(() => findLaobanExecutableDirectory({start})).toThrow(
            `Cannot find Laoban executable index.ts at ${path.join(executableDir, "index.ts")}`,
        )
    })
})