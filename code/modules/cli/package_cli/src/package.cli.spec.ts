import {errors, errorsOrThrow, value, valueOrThrow} from "@laoban/errors"
import {
    flushAllTouchedChannels,
    ModuleObservabilityScope,
    withModuleObservability,
} from "@laoban/observability"
import {
    nodeObservabilityFixture,
    NodeReadChannel,
    NodeRef,
    NodeWriteChannel,
    TestNodeObservabilityContext,
} from "@laoban/observability_node"
import {
    prettyPrintGenerationsSwimlanes,
    prettyPrintGenerationsVertical,
    throttlePlan,
    ThrottlePlanFn,
} from "@laoban/topologicalsort"
import {
    laobanPackageCommands,
    loadConfigAndPackages,
    loadSortedLaobanProject,
    makeNameToNormalisedPackageDetails,
    type LaobanPackageCliContext,
    type LoadConfigFn,
    type LoadPackagesFn,
} from "./package.cli"
import type {
    LoadedLaobanProject,
    LoadedPackageDetail,
    NormalisedPackageDetails,
} from "@laoban/package_details"
import {packageDetailsGraph} from "@laoban/package_details/src/package.details.sort"

function loadedPackageDetail(
    packageFile: string,
    contents: NormalisedPackageDetails,
): LoadedPackageDetail {
    return {
        packageFile,
        dir: packageFile.replace(/\/package\.details\.json$/, ""),
        contents,
    } as LoadedPackageDetail
}

function normalised(
    name: string,
    links: string[] = [],
    extra: Partial<NormalisedPackageDetails> = {},
): NormalisedPackageDetails {
    return {
        template: "default",
        name,
        description: undefined,
        links,
        devLinks: [],
        peerLinks: [],
        allLinks: links,
        guards: {},
        files: {},
        meta: {},
        ...extra,
    }
}

function loadedProject(
    packages: Record<string, LoadedPackageDetail>,
    configDirectory: string = "/workspace",
): LoadedLaobanProject {
    return {
        loadedLaobanConfig: {
            config: {
                packageManager: "pnpm" as any,
                versionFile: "version.txt",
                parents: [],
                properties: {},
                templates: {},
                throttle: 100,
                defaultEnv: {},
                scripts: {},
                skipDirectories: [],
            },
            configFile: `${configDirectory}/laoban.json`,
            configDirectory,
            loadedFiles: [`${configDirectory}/laoban.json`],
        },
        loadedPackageDetails: packages,
    }
}

type TestLaobanPackageCliContext =
    LaobanPackageCliContext<NodeReadChannel, NodeWriteChannel, NodeRef> &
    TestNodeObservabilityContext & {
    loadConfigFn: jest.MockedFunction<LoadConfigFn>
    loadPackagesFn: jest.MockedFunction<LoadPackagesFn>
}

const fixture = nodeObservabilityFixture()

async function makeContext(): Promise<TestLaobanPackageCliContext> {
    const nodeContext = await fixture.makeContext({
        rootPrefix: "laoban-package-cli-",
    })

    const loadConfigFn = jest.fn() as jest.MockedFunction<LoadConfigFn>
    const loadPackagesFn = jest.fn() as jest.MockedFunction<LoadPackagesFn>

    return {
        ...nodeContext,

        cwd: "/workspace",
        fileOps: {} as any,
        loadLaobanConfig: jest.fn(),
        loadLaobanFileConfig: jest.fn(),

        loadConfigFn,
        loadPackagesFn,
        loadConfigAndPackagesFn: loadConfigAndPackages,

        throttle: 100,
        throttlePlan: throttlePlan as ThrottlePlanFn<LoadedPackageDetail>,
    } as unknown as TestLaobanPackageCliContext
}

function command(name: "list" | "view" | "sort"): any {
    const group: any = laobanPackageCommands<NodeReadChannel, NodeWriteChannel, NodeRef>()
    return group.commands?.[name] ?? group.children?.[name] ?? group[name]
}
const packageHeaderWrite = () =>
    expectedWrite(
        [
            "Directory  Name   Template",
            "---------  -----  --------",
        ].join("\n"),
    )
const expectedWrite = (msg: string) =>
    fixture.expectedRootWrite(msg)

const packageLine = (
    directory: string,
    name: string,
    template: string = "default",
    directoryWidth: number = "directory".length,
    nameWidth: number = "alpha".length,
): string =>
    [
        directory.padEnd(directoryWidth),
        name.padEnd(nameWidth),
        template,
    ].join("  ").trimEnd()

const directoryWidth = "Directory".length
const nameWidth = "alpha".length

const summaryWrite = (
    packages: number,
    generations: number,
) =>
    expectedWrite(
        [
            "",
            "Summary",
            `  packages:    ${packages}`,
            `  generations: ${generations}`,
        ].join("\n"),
    )

describe("package cli", () => {
    beforeEach(() => {
        jest.resetAllMocks()
    })

    afterEach(async () => {
        await fixture.cleanup()
    })

    describe("makeNameToNormalisedPackageDetails", () => {
        it("maps loaded package details to contents", () => {
            const alpha = normalised("alpha")
            const beta = normalised("beta", ["alpha"])

            expect(
                makeNameToNormalisedPackageDetails({
                    alpha: loadedPackageDetail("/workspace/alpha/package.details.json", alpha),
                    beta: loadedPackageDetail("/workspace/beta/package.details.json", beta),
                }),
            ).toEqual({
                alpha,
                beta,
            })
        })

        it("returns empty object for empty input", () => {
            expect(makeNameToNormalisedPackageDetails({})).toEqual({})
        })
    })

    describe("loadConfigAndPackages", () => {
        it("loads config then packages", async () => {
            const context = await makeContext()
            const loadedConfig = {
                configDirectory: "/workspace",
            } as any
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
            })

            context.loadConfigFn.mockResolvedValue(value(loadedConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const result = await loadConfigAndPackages(context)

            expect(valueOrThrow(result)).toEqual(loaded)
            expect(context.loadConfigFn).toHaveBeenCalledWith(context)
            expect(context.loadPackagesFn).toHaveBeenCalledWith(loadedConfig, context)
        })

        it("returns config load errors", async () => {
            const context = await makeContext()
            context.loadConfigFn.mockResolvedValue(errors({kind: "badConfig", message: "cannot load config"} as any))

            const result = await loadConfigAndPackages(context)

            expect(errorsOrThrow(result)).toEqual([
                {kind: "badConfig", message: "cannot load config"},
            ])
            expect(context.loadPackagesFn).not.toHaveBeenCalled()
        })

        it("returns package load errors", async () => {
            const context = await makeContext()
            const loadedConfig = {
                configDirectory: "/workspace",
            } as any

            context.loadConfigFn.mockResolvedValue(value(loadedConfig))
            context.loadPackagesFn.mockResolvedValue(errors({
                kind: "badPackages",
                message: "cannot load packages",
            } as any))

            const result = await loadConfigAndPackages(context)

            expect(errorsOrThrow(result)).toEqual([
                {kind: "badPackages", message: "cannot load packages"},
            ])
        })
    })

    describe("loadSortedLaobanProject", () => {
        it("returns topological generations", async () => {
            const context = await makeContext()
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
                gamma: loadedPackageDetail("/workspace/gamma/package.details.json", normalised("gamma", ["alpha"])),
            })

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const result = await loadSortedLaobanProject(context)
            const sorted = valueOrThrow(result)

            expect(sorted.loaded).toEqual(loaded)
            expect(sorted.generations.map(g => g.map(p => p.name))).toEqual([
                ["alpha"],
                ["beta", "gamma"],
            ])
        })

        it("returns empty generations when there are no packages", async () => {
            const context = await makeContext()
            const loaded = loadedProject({})

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const result = await loadSortedLaobanProject(context)

            expect(valueOrThrow(result).generations).toEqual([])
        })

        it("returns sorting issues", async () => {
            const context = await makeContext()
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha", ["beta"])),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
            })

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const result = await loadSortedLaobanProject(context)

            expect(errorsOrThrow(result)).toEqual([
                {
                    context: {
                        cyclePath: [
                            "alpha",
                            "beta",
                            "alpha",
                        ],
                        purpose: "sortLaobanProject",
                    },
                    kind: "graphCycle",
                    message: "Cycle detected in sortLaobanProject: alpha -> beta -> alpha",
                },
            ])
        })
    })

    describe("commands", () => {
        it("list writes durable package logs, mirrors them to session, flushes touched channels to stdout, and writes the summary", async () => {
            const context = await makeContext()
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
            })

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const result = await command("list").execute({}, context)

            expect(valueOrThrow(result)).toBeUndefined()

            const alphaLine = `${packageLine("alpha", "alpha", "default")}\n`
            const betaLine = `${packageLine("beta", "beta", "default")}\n`

            expect(await fixture.readLog(context, "/workspace/alpha")).toEqual(alphaLine)
            expect(await fixture.readSession(context, "/workspace/alpha")).toEqual(alphaLine)
            expect(await fixture.readLog(context, "/workspace/beta")).toEqual(betaLine)
            expect(await fixture.readSession(context, "/workspace/beta")).toEqual(betaLine)

            expect(context.stdOutRecorder.lines().sort()).toEqual([
                packageLine("alpha", "alpha", "default"),
                packageLine("beta", "beta", "default"),
            ])

            expect(context.channelsState.state.alpha.moduleScope).toEqual({
                module: "alpha",
                directory: "/workspace/alpha",
            })
            expect(context.channelsState.state.beta.moduleScope).toEqual({
                module: "beta",
                directory: "/workspace/beta",
            })

            expect(context.channelsState.state.alpha.channels).toBeUndefined()
            expect(context.channelsState.state.beta.channels).toBeUndefined()
            expect(context.channelsState.state.alpha.lastSize).toBe(alphaLine.length)
            expect(context.channelsState.state.beta.lastSize).toBe(betaLine.length)
            expect(context.channelsState.state.alpha.touched).toBe(false)
            expect(context.channelsState.state.beta.touched).toBe(false)

            expect(context.recording.logs).toEqual([
                packageHeaderWrite(),
                summaryWrite(2, 1),
            ])
        })

        it("list flushes each throttled generation before the next generation without duplicating output", async () => {
            const context = await makeContext()
            context.throttle = 1

            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta")),
            })

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const result = await command("list").execute({}, context)

            expect(valueOrThrow(result)).toBeUndefined()

            const alphaLine = `${packageLine("alpha", "alpha", "default")}\n`
            const betaLine = `${packageLine("beta", "beta", "default")}\n`

            expect(context.stdOutRecorder.lines()).toEqual([
                packageLine("alpha", "alpha", "default"),
                packageLine("beta", "beta", "default"),
            ])

            expect(await fixture.readLog(context, "/workspace/alpha")).toEqual(alphaLine)
            expect(await fixture.readLog(context, "/workspace/beta")).toEqual(betaLine)

            expect(context.channelsState.state.alpha.channels).toBeUndefined()
            expect(context.channelsState.state.beta.channels).toBeUndefined()
            expect(context.channelsState.state.alpha.lastSize).toBe(alphaLine.length)
            expect(context.channelsState.state.beta.lastSize).toBe(betaLine.length)
            expect(context.channelsState.state.alpha.touched).toBe(false)
            expect(context.channelsState.state.beta.touched).toBe(false)

            expect(context.recording.logs).toEqual([
                packageHeaderWrite(),
                summaryWrite(2, 2),
            ])
        })

        it("view writes the package name requested", async () => {
            const context = await makeContext()

            const result = await command("view").execute({name: "alpha"}, context)

            expect(result).toEqual(value(undefined))
            expect(context.recording.logs).toEqual([
                expectedWrite("package view alpha"),
            ])
        })

        it("sort writes vertical output by default", async () => {
            const context = await makeContext()
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
                gamma: loadedPackageDetail("/workspace/gamma/package.details.json", normalised("gamma", ["beta"])),
            })

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const expectedGenerations = valueOrThrow(await loadSortedLaobanProject(context)).generations
            const expectedOutput = "\n" + prettyPrintGenerationsVertical(expectedGenerations, packageDetailsGraph)

            context.recording.logs.length = 0
            context.loadConfigFn.mockClear()
            context.loadPackagesFn.mockClear()
            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            await command("sort").execute({horizontal: false}, context)

            expect(context.recording.logs).toEqual([
                expectedWrite(expectedOutput),
            ])
        })

        it("sort writes swimlane output when requested", async () => {
            const context = await makeContext()
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
                gamma: loadedPackageDetail("/workspace/gamma/package.details.json", normalised("gamma", ["beta"])),
            })

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            const expectedGenerations = valueOrThrow(await loadSortedLaobanProject(context)).generations
            const expectedOutput = "\n" + prettyPrintGenerationsSwimlanes(expectedGenerations, packageDetailsGraph)

            context.recording.logs.length = 0
            context.loadConfigFn.mockClear()
            context.loadPackagesFn.mockClear()
            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig))
            context.loadPackagesFn.mockResolvedValue(value(loaded))

            await command("sort").execute({horizontal: true}, context)

            expect(context.recording.logs).toEqual([
                expectedWrite(expectedOutput),
            ])
        })
    })

    it("test harness writes a module log to real files and flushes it to stdout", async () => {
        const context = await makeContext()

        const moduleScope: ModuleObservabilityScope = {
            module: "alpha" as any,
            directory: "/workspace/alpha",
        }

        const writeResult = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                observability.log("hello alpha")
                return value(undefined)
            },
        )

        expect(valueOrThrow(writeResult)).toBeUndefined()

        expect(await fixture.readLog(context, "/workspace/alpha")).toEqual(
            "00:00:00 INFO hello alpha\n",
        )
        expect(await fixture.readSession(context, "/workspace/alpha")).toEqual(
            "00:00:00 INFO hello alpha\n",
        )

        const flushResult = await flushAllTouchedChannels(context.channelsState)(
            context.stdOut,
        )

        expect(valueOrThrow(flushResult)).toBeUndefined()

        expect(context.stdOutRecorder.lines()).toEqual([
            "00:00:00 INFO hello alpha",
        ])

        expect(context.channelsState.state.alpha.moduleScope).toEqual(moduleScope)
        expect(context.channelsState.state.alpha.channels).toBeUndefined()
        expect(context.channelsState.state.alpha.lastSize).toBe(
            "00:00:00 INFO hello alpha\n".length,
        )
        expect(context.channelsState.state.alpha.touched).toBe(false)
    })
})