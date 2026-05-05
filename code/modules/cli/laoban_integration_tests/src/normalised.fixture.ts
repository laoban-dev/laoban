import * as fs from "node:fs"
import * as path from "node:path"

export function normaliseSlashes(s: string): string {
    return s.replace(/\\/g, "/")
}

export function isIgnorableOutputLine(line: string): boolean {
    return (
        /^\(node:\d+\) \[DEP0128\] DeprecationWarning: Invalid 'main' field in /.test(line) ||
        line === "(Use `node --trace-deprecation ...` to show where the warning was created)"
    )
}

export function toArrayReplacingRoot(root: string, text: string): string[] {
    const normalisedRoot = normaliseSlashes(path.resolve(root))
    const normalisedText = normaliseSlashes(text)

    const replaced = normalisedText
        .split(normalisedRoot).join("<root>")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trimEnd()

    if (replaced.length === 0) return []

    return replaced
        .split("\n")
        .filter(line => !isIgnorableOutputLine(line))
}

export function expectedLines(
    fixtureRoot: string,
    fixtureDir: string,
    expectedFile: string,
): string[] {
    return toArrayReplacingRoot(
        fixtureRoot,
        fs.readFileSync(path.join(fixtureDir, expectedFile)).toString(),
    )
}

export function expectActualToEqualExpected(actual: string[], expected: string[]) {
    try {
        expect(actual).toEqual(expected)
    } catch (e) {
        console.log("actual\n", actual.join("\n"))
        console.log("---")
        throw e
    }
}