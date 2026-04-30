import {errorsOrThrow, valueOrThrow} from "@laoban/errors"
import {recordingObservability} from "@laoban/observability"
import {NameAndDependsOn} from "@laoban/topologicalsort"
import {
    buildExecutionGraph,
    buildExecutionItems,
    dependsOnExecutionItem,
    ExecutionItem,
    ExecutionItemPlannerTypeClass,
    executionItemGraphName,
    makeExecutionPlan,
    type ExecutionScope,
} from "./execution.plan"

type TestCommand = {
    name: string
    executionScope: ExecutionScope
}

type TestPackage = {
    name: string
    dependsOn: string[]
}

const packageTc: NameAndDependsOn<TestPackage> = {
    getName: p => p.name,
    dependsOn: p => p.dependsOn,
}

const executionItemTc: ExecutionItemPlannerTypeClass<TestCommand, TestPackage, ExecutionItem<TestCommand, TestPackage>> = {
    makeEachPackage: (stepIndex, command, pkg) => ({
        kind: "eachPackage",
        stepIndex,
        command,
        pkg,
    }),
    makeOncePerWorkspace: (stepIndex, command) => ({
        kind: "oncePerWorkSpace",
        stepIndex,
        command,
    }),
    kind: h => h.kind,
    stepIndex: h => h.stepIndex,
    command: h => h.command,
    pkg: h => h.kind === "eachPackage" ? h.pkg : undefined,
    display: h =>
        h.kind === "eachPackage"
            ? `${h.stepIndex}:${h.command.name}:${h.pkg.name}`
            : `${h.stepIndex}:${h.command.name}:workspace`,
}

function cmd(name: string, executionScope: ExecutionScope): TestCommand {
    return {name, executionScope}
}

function pkg(name: string, dependsOn: string[] = []): TestPackage {
    return {name, dependsOn}
}

function planNames(plan: ExecutionItem<TestCommand, TestPackage>[][]): string[][] {
    return plan.map(g => g.map(item => executionItemGraphName(item, executionItemTc, packageTc)))
}

describe("execution plan", () => {
    describe("buildExecutionItems", () => {
        it("builds one item per package for eachPackage and one item for oncePerWorkSpace", () => {
            const commands = [
                cmd("compile", "eachPackage"),
                cmd("install", "oncePerWorkSpace"),
                cmd("test", "eachPackage"),
            ]
            const alpha = pkg("alpha")
            const beta = pkg("beta")

            const actual = buildExecutionItems(commands, [
                [alpha, beta],
                [],
                [alpha],
            ], executionItemTc)

            expect(actual).toEqual([
                {kind: "eachPackage", stepIndex: 0, command: commands[0], pkg: alpha},
                {kind: "eachPackage", stepIndex: 0, command: commands[0], pkg: beta},
                {kind: "oncePerWorkSpace", stepIndex: 1, command: commands[1]},
                {kind: "eachPackage", stepIndex: 2, command: commands[2], pkg: alpha},
            ])
        })

        it("throws if commands and package arrays differ in length", () => {
            expect(() =>
                buildExecutionItems(
                    [cmd("compile", "eachPackage")],
                    [],
                    executionItemTc,
                ),
            ).toThrow("buildExecutionItems expected commands.length (1) to equal packagesForCommand.length (0)")
        })
    })

    describe("executionItemGraphName", () => {
        it("creates a stable name for package items", () => {
            const item: ExecutionItem<TestCommand, TestPackage> = {
                kind: "eachPackage",
                stepIndex: 2,
                command: cmd("test", "eachPackage"),
                pkg: pkg("alpha"),
            }

            expect(executionItemGraphName(item, executionItemTc, packageTc))
                .toEqual("step:2:pkg:alpha")
        })

        it("creates a stable name for workspace items", () => {
            const item: ExecutionItem<TestCommand, TestPackage> = {
                kind: "oncePerWorkSpace",
                stepIndex: 1,
                command: cmd("install", "oncePerWorkSpace"),
            }

            expect(executionItemGraphName(item, executionItemTc, packageTc))
                .toEqual("step:1:workspace")
        })
    })

    describe("dependsOnExecutionItem", () => {
        it("adds same-step package dependency edges", () => {
            const compile = cmd("compile", "eachPackage")
            const alpha = pkg("alpha")
            const beta = pkg("beta", ["alpha"])

            const items = buildExecutionItems([compile], [[alpha, beta]], executionItemTc)
            const betaItem = items.find(i => i.kind === "eachPackage" && i.pkg.name === "beta")!

            const actual = dependsOnExecutionItem(betaItem, items, executionItemTc, packageTc)

            expect(actual).toEqual(["step:0:pkg:alpha"])
        })

        it("adds workflow dependency from nearest earlier actual step for the same package", () => {
            const commands = [
                cmd("compile", "eachPackage"),
                cmd("test", "eachPackage"),
            ]
            const alpha = pkg("alpha")

            const items = buildExecutionItems(commands, [[alpha], [alpha]], executionItemTc)
            const testAlpha = items.find(i =>
                i.kind === "eachPackage" &&
                i.stepIndex === 1 &&
                i.pkg.name === "alpha",
            )!

            const actual = dependsOnExecutionItem(testAlpha, items, executionItemTc, packageTc)

            expect(actual).toEqual(["step:0:pkg:alpha"])
        })

        it("adds workspace barrier dependency for later package items", () => {
            const commands = [
                cmd("compile", "eachPackage"),
                cmd("install", "oncePerWorkSpace"),
                cmd("test", "eachPackage"),
            ]
            const alpha = pkg("alpha")

            const items = buildExecutionItems(commands, [[alpha], [], [alpha]], executionItemTc)
            const testAlpha = items.find(i =>
                i.kind === "eachPackage" &&
                i.stepIndex === 2 &&
                i.pkg.name === "alpha",
            )!

            const actual = dependsOnExecutionItem(testAlpha, items, executionItemTc, packageTc).sort()

            expect(actual).toEqual([
                "step:1:workspace",
                "step:0:pkg:alpha",
            ].sort())
        })

        it("workspace items depend on all earlier items", () => {
            const commands = [
                cmd("compile", "eachPackage"),
                cmd("test", "eachPackage"),
                cmd("install", "oncePerWorkSpace"),
            ]
            const alpha = pkg("alpha")
            const beta = pkg("beta")

            const items = buildExecutionItems(commands, [[alpha], [beta], []], executionItemTc)
            const workspace = items.find(i =>
                i.kind === "oncePerWorkSpace" &&
                i.stepIndex === 2,
            )!

            const actual = dependsOnExecutionItem(workspace, items, executionItemTc, packageTc).sort()

            expect(actual).toEqual([
                "step:0:pkg:alpha",
                "step:1:pkg:beta",
            ].sort())
        })
    })

    describe("buildExecutionGraph", () => {
        it("builds a NameAndDependsOn graph over execution items", () => {
            const commands = [
                cmd("compile", "eachPackage"),
                cmd("test", "eachPackage"),
            ]
            const alpha = pkg("alpha")
            const beta = pkg("beta", ["alpha"])

            const items = buildExecutionItems(commands, [[alpha, beta], [alpha, beta]], executionItemTc)
            const graph = buildExecutionGraph(items, executionItemTc, packageTc)

            const testBeta = items.find(i =>
                i.kind === "eachPackage" &&
                i.stepIndex === 1 &&
                i.pkg.name === "beta",
            )!

            expect(graph.getName(testBeta)).toEqual("step:1:pkg:beta")
            expect(graph.dependsOn(testBeta).sort()).toEqual([
                "step:0:pkg:beta",
                "step:1:pkg:alpha",
            ].sort())
        })
    })

    describe("makeExecutionPlan", () => {
        it("makes a simple one-step dependency ordered plan", () => {
            const {observability} = recordingObservability()
            const alpha = pkg("alpha")
            const beta = pkg("beta", ["alpha"])

            const actual = valueOrThrow(
                makeExecutionPlan(
                    "simple",
                    [cmd("compile", "eachPackage")],
                    [[alpha, beta]],
                    executionItemTc,
                    packageTc,
                    observability,
                ),
            )

            expect(planNames(actual.plan)).toEqual([
                ["step:0:pkg:alpha"],
                ["step:0:pkg:beta"],
            ])

            expect(actual.stats).toEqual({
                commandCount: 1,
                distinctPackageDetails: [alpha, beta],
                executionItemCount: 2,
                packageExecutionItemCount: 2,
                barrierCount: 0,
                generationCount: 2,
                largestGenerationSize: 1,
            })
        })

        it("allows later steps to pipeline without a global barrier", () => {
            const {observability} = recordingObservability()
            const alpha = pkg("alpha")
            const beta = pkg("beta", ["alpha"])

            const actual = valueOrThrow(
                makeExecutionPlan(
                    "pipeline",
                    [
                        cmd("compile", "eachPackage"),
                        cmd("test", "eachPackage"),
                    ],
                    [
                        [alpha, beta],
                        [alpha, beta],
                    ],
                    executionItemTc,
                    packageTc,
                    observability,
                ),
            )

            expect(planNames(actual.plan)).toEqual([
                ["step:0:pkg:alpha"],
                ["step:0:pkg:beta", "step:1:pkg:alpha"],
                ["step:1:pkg:beta"],
            ])

            expect(actual.stats).toEqual({
                commandCount: 2,
                distinctPackageDetails: [alpha, beta],
                executionItemCount: 4,
                packageExecutionItemCount: 4,
                barrierCount: 0,
                generationCount: 3,
                largestGenerationSize: 2,
            })
        })

        it("treats oncePerWorkSpace as a barrier", () => {
            const {observability} = recordingObservability()
            const alpha = pkg("alpha")
            const beta = pkg("beta", ["alpha"])

            const actual = valueOrThrow(
                makeExecutionPlan(
                    "barrier",
                    [
                        cmd("compile", "eachPackage"),
                        cmd("install", "oncePerWorkSpace"),
                        cmd("test", "eachPackage"),
                    ],
                    [
                        [alpha, beta],
                        [],
                        [alpha, beta],
                    ],
                    executionItemTc,
                    packageTc,
                    observability,
                ),
            )

            expect(planNames(actual.plan)).toEqual([
                ["step:0:pkg:alpha"],
                ["step:0:pkg:beta"],
                ["step:1:workspace"],
                ["step:2:pkg:alpha"],
                ["step:2:pkg:beta"],
            ])

            expect(actual.stats).toEqual({
                commandCount: 3,
                distinctPackageDetails: [alpha, beta],
                executionItemCount: 5,
                packageExecutionItemCount: 4,
                barrierCount: 1,
                generationCount: 5,
                largestGenerationSize: 1,
            })
        })

        it("uses the nearest earlier actual step when a package is absent from an intermediate command", () => {
            const {observability} = recordingObservability()
            const alpha = pkg("alpha")

            const actual = valueOrThrow(
                makeExecutionPlan(
                    "missing-middle",
                    [
                        cmd("compile", "eachPackage"),
                        cmd("lint", "eachPackage"),
                        cmd("test", "eachPackage"),
                    ],
                    [
                        [alpha],
                        [],
                        [alpha],
                    ],
                    executionItemTc,
                    packageTc,
                    observability,
                ),
            )

            expect(planNames(actual.plan)).toEqual([
                ["step:0:pkg:alpha"],
                ["step:2:pkg:alpha"],
            ])

            expect(actual.stats).toEqual({
                commandCount: 3,
                distinctPackageDetails: [alpha],
                executionItemCount: 2,
                packageExecutionItemCount: 2,
                barrierCount: 0,
                generationCount: 2,
                largestGenerationSize: 1,
            })
        })

        it("returns duplicate graph name issues when the same package appears twice in one step", () => {
            const {observability} = recordingObservability()
            const alpha1 = pkg("alpha")
            const alpha2 = pkg("alpha")

            const actual = makeExecutionPlan(
                "duplicate",
                [cmd("compile", "eachPackage")],
                [[alpha1, alpha2]],
                executionItemTc,
                packageTc,
                observability,
            )

            expect(errorsOrThrow(actual)).toEqual([
                {
                    kind: "duplicateGraphName",
                    message: "Duplicate graph name detected in duplicate:execution_plan: step:0:pkg:alpha",
                    context: {
                        purpose: "duplicate:execution_plan",
                        duplicateName: "step:0:pkg:alpha",
                    },
                },
            ])
        })

        it("records observability for a successful plan", () => {
            const recording = recordingObservability()
            const alpha = pkg("alpha")

            valueOrThrow(
                makeExecutionPlan(
                    "someContext",
                    [cmd("compile", "eachPackage")],
                    [[alpha]],
                    executionItemTc,
                    packageTc,
                    recording.observability,
                ),
            )

            expect(recording.debug).toEqual([
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["execution", "plan", "start"],
                    context: "execution:plan:start",
                    level: "debug",
                    msg: [
                        {
                            purpose: "someContext",
                            commandCount: 1,
                            packageSetCount: 1,
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["someContext:execution_plan", "topologicalGenerations"],
                    context: "someContext:execution_plan:topologicalGenerations",
                    level: "debug",
                    msg: [
                        "starting",
                        {
                            roots: [
                                "step:0:pkg:alpha",
                            ],
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["someContext:execution_plan", "topologicalGenerations", "visit"],
                    context: "someContext:execution_plan:topologicalGenerations:visit",
                    level: "debug",
                    msg: [
                        "enter",
                        {
                            name: "step:0:pkg:alpha",
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["someContext:execution_plan", "topologicalGenerations", "visit"],
                    context: "someContext:execution_plan:topologicalGenerations:visit",
                    level: "debug",
                    msg: [
                        "leave",
                        {
                            generation: 0,
                            name: "step:0:pkg:alpha",
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["someContext:execution_plan", "topologicalGenerations"],
                    context: "someContext:execution_plan:topologicalGenerations",
                    level: "debug",
                    msg: [
                        "finished",
                        {
                            generationCount: 1,
                            generations: [
                                [
                                    "step:0:pkg:alpha",
                                ],
                            ],
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["execution", "plan", "finished"],
                    context: "execution:plan:finished",
                    level: "debug",
                    msg: [
                        {
                            purpose: "someContext",
                            commandCount: 1,
                            distinctPackageDetailCount: 1,
                            executionItemCount: 1,
                            packageExecutionItemCount: 1,
                            barrierCount: 0,
                            generationCount: 1,
                            largestGenerationSize: 1,
                        },
                    ],
                },
            ])
            expect(recording.counts).toEqual([
                "someContext:execution_plan.topologicalGenerations.run",
            ])

            expect(recording.durations).toEqual([
                {
                    name: "someContext:execution_plan.topologicalGenerations.duration",
                    durationMs: expect.any(Number),
                },
            ])
        })
    })

    it("puts independent packages in the same generation", () => {
        const {observability} = recordingObservability()
        const alpha = pkg("alpha")
        const beta = pkg("beta")

        const actual = valueOrThrow(
            makeExecutionPlan(
                "independent",
                [cmd("compile", "eachPackage")],
                [[alpha, beta]],
                executionItemTc,
                packageTc,
                observability,
            ),
        )

        expect(planNames(actual.plan)).toEqual([
            ["step:0:pkg:alpha", "step:0:pkg:beta"],
        ])

        expect(actual.stats).toEqual({
            commandCount: 1,
            distinctPackageDetails: [alpha, beta],
            executionItemCount: 2,
            packageExecutionItemCount: 2,
            barrierCount: 0,
            generationCount: 1,
            largestGenerationSize: 2,
        })
    })

    it("builds a workspace-only script plan", () => {
        const {observability} = recordingObservability()

        const actual = valueOrThrow(
            makeExecutionPlan(
                "workspace-only",
                [
                    cmd("install", "oncePerWorkSpace"),
                    cmd("publish", "oncePerWorkSpace"),
                ],
                [
                    [],
                    [],
                ],
                executionItemTc,
                packageTc,
                observability,
            ),
        )

        expect(planNames(actual.plan)).toEqual([
            ["step:0:workspace"],
            ["step:1:workspace"],
        ])

        expect(actual.stats).toEqual({
            commandCount: 2,
            distinctPackageDetails: [],
            executionItemCount: 2,
            packageExecutionItemCount: 0,
            barrierCount: 2,
            generationCount: 2,
            largestGenerationSize: 1,
        })
    })

    it("makes later package work depend on all earlier workspace barriers", () => {
        const {observability} = recordingObservability()
        const alpha = pkg("alpha")

        const actual = valueOrThrow(
            makeExecutionPlan(
                "two-barriers",
                [
                    cmd("prepare", "oncePerWorkSpace"),
                    cmd("install", "oncePerWorkSpace"),
                    cmd("build", "eachPackage"),
                ],
                [
                    [],
                    [],
                    [alpha],
                ],
                executionItemTc,
                packageTc,
                observability,
            ),
        )

        expect(planNames(actual.plan)).toEqual([
            ["step:0:workspace"],
            ["step:1:workspace"],
            ["step:2:pkg:alpha"],
        ])

        expect(actual.stats).toEqual({
            commandCount: 3,
            distinctPackageDetails: [alpha],
            executionItemCount: 3,
            packageExecutionItemCount: 1,
            barrierCount: 2,
            generationCount: 3,
            largestGenerationSize: 1,
        })
    })

    it("keeps distinctPackageDetails in first-seen order", () => {
        const {observability} = recordingObservability()
        const beta = pkg("beta")
        const alpha = pkg("alpha")
        const gamma = pkg("gamma")

        const actual = valueOrThrow(
            makeExecutionPlan(
                "package-order",
                [
                    cmd("compile", "eachPackage"),
                    cmd("test", "eachPackage"),
                ],
                [
                    [beta, alpha],
                    [gamma, beta],
                ],
                executionItemTc,
                packageTc,
                observability,
            ),
        )

        expect(actual.stats.distinctPackageDetails).toEqual([
            beta,
            alpha,
            gamma,
        ])
    })

    it("handles diamond dependencies correctly", () => {
        const {observability} = recordingObservability()
        const d = pkg("d")
        const b = pkg("b", ["d"])
        const c = pkg("c", ["d"])
        const a = pkg("a", ["b", "c"])

        const actual = valueOrThrow(
            makeExecutionPlan(
                "diamond",
                [cmd("compile", "eachPackage")],
                [[a, b, c, d]],
                executionItemTc,
                packageTc,
                observability,
            ),
        )

        expect(planNames(actual.plan)).toEqual([
            ["step:0:pkg:d"],
            ["step:0:pkg:b", "step:0:pkg:c"],
            ["step:0:pkg:a"],
        ])

        expect(actual.stats).toEqual({
            commandCount: 1,
            distinctPackageDetails: [a, b, c, d],
            executionItemCount: 4,
            packageExecutionItemCount: 4,
            barrierCount: 0,
            generationCount: 3,
            largestGenerationSize: 2,
        })
    })

    it("handles an empty workspace after filtering", () => {
        const {observability} = recordingObservability()

        const actual = valueOrThrow(
            makeExecutionPlan(
                "empty-workspace",
                [
                    cmd("compile", "eachPackage"),
                    cmd("test", "eachPackage"),
                ],
                [
                    [],
                    [],
                ],
                executionItemTc,
                packageTc,
                observability,
            ),
        )

        expect(planNames(actual.plan)).toEqual([])

        expect(actual.stats).toEqual({
            commandCount: 2,
            distinctPackageDetails: [],
            executionItemCount: 0,
            packageExecutionItemCount: 0,
            barrierCount: 0,
            generationCount: 0,
            largestGenerationSize: 0,
        })
    })
})