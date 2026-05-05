import {
    forEachDirectory,
    testRoot,
} from "./fixture.directories"
import {runLaobanInFixture} from "./fixture.runner"
import {
    expectActualToEqualExpected,
    expectedLines,
    toArrayReplacingRoot,
} from "./normalised.fixture"

jest.setTimeout(30_000)

describe("config directory integration tests", () => {
    forEachDirectory(testRoot, "config", directory => {
        test(`packages in ${directory.fixtureName}`, async () => {
            const result = await runLaobanInFixture({
                fixtureDir: directory.fixtureDir,
                args: ["packages"],
            })

            const expected = expectedLines(
                directory.fixtureRoot,
                directory.fixtureDir,
                "expectedPackages.txt",
            )

            const actual = toArrayReplacingRoot(
                directory.fixtureRoot,
                `${result.stdout}${result.stderr}`,
            )

            expectActualToEqualExpected(actual, expected)
        })
    })
})