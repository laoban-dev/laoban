import * as fs from "node:fs"
import * as path from "node:path"

export type FixtureDirectory = Readonly<{
    fixtureRoot: string
    fixtureName: string
    fixtureDir: string
}>

export type FindLaobanDirectoryOptions = Readonly<{
    start?: string
    rootDirectoryName?: string
}>

export type FindFixtureRootOptions = Readonly<{
    start?: string
    rootDirectoryName?: string
    fixtureDirectoryName?: string
}>

export type FindLaobanExecutableDirectoryOptions = Readonly<{
    start?: string
    rootDirectoryName?: string
    fixtureDirectoryName?: string
}>

function isDirectory(dir: string): boolean {
    try {
        return fs.statSync(dir).isDirectory()
    } catch {
        return false
    }
}

function isFile(filename: string): boolean {
    try {
        return fs.statSync(filename).isFile()
    } catch {
        return false
    }
}

/**
 * Walk upward from start until it finds a directory named `laoban`.
 *
 * Defaults to starting from process.cwd().
 *
 * This is deliberately synchronous because Jest must register tests
 * synchronously during describe/test discovery.
 */
export function findLaobanDirectory(
    options: FindLaobanDirectoryOptions = {},
): string {
    const rootDirectoryName = options.rootDirectoryName ?? "laoban"
    let current = path.resolve(options.start ?? process.cwd())

    while (true) {
        if (path.basename(current) === rootDirectoryName) {
            return current
        }

        const parent = path.dirname(current)
        if (parent === current) {
            throw new Error(
                `Cannot find directory named ${rootDirectoryName} from ${path.resolve(options.start ?? process.cwd())}`,
            )
        }

        current = parent
    }
}

export function findFixtureRoot(
    options: FindFixtureRootOptions = {},
): string {
    const fixtureDirectoryName = options.fixtureDirectoryName ?? "tests"
    const root = findLaobanDirectory(options)
    const fixtureRoot = path.join(root, fixtureDirectoryName)

    if (!isDirectory(fixtureRoot)) {
        throw new Error(
            `Cannot find fixture root directory at ${fixtureRoot}`,
        )
    }

    return fixtureRoot
}

export function findLaobanExecutableDirectory(
    options: FindLaobanExecutableDirectoryOptions = {},
): string {
    const root = findLaobanDirectory(options)

    const executableDirectory = path.join(
        root,
        "code",
        "modules",
        "cli",
        "laoban",
    )

    const indexTs = path.join(executableDirectory, "index.ts")

    if (!isDirectory(executableDirectory)) {
        throw new Error(
            `Cannot find Laoban executable directory at ${executableDirectory}`,
        )
    }

    if (!isFile(indexTs)) {
        throw new Error(
            `Cannot find Laoban executable index.ts at ${indexTs}`,
        )
    }

    return executableDirectory
}

export const laobanDirectory = findLaobanDirectory()

export const testRoot = findFixtureRoot({
    start: laobanDirectory,
})

export const laobanExecutableDirectory = findLaobanExecutableDirectory({
    start: laobanDirectory,
})

export function fixtureDirectoriesUnder(
    root: string,
    namedDirectory: string,
): FixtureDirectory[] {
    const fixtureRoot = path.join(root, namedDirectory)

    return fs
        .readdirSync(fixtureRoot, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
        .map(fixtureName => ({
            fixtureRoot,
            fixtureName,
            fixtureDir: path.join(fixtureRoot, fixtureName),
        }))
}

export function forEachDirectory(
    root: string,
    namedDirectory: string,
    fn: (directory: FixtureDirectory) => void,
): void {
    for (const directory of fixtureDirectoriesUnder(root, namedDirectory)) {
        fn(directory)
    }
}