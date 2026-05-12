import {
    BaseIssue,
    errors,
    isErrors,
    value,
    warnings,
} from "@laoban/errors"
import {
    ChannelObservability,
    defaultModuleObservabilityScope,
    makeObservability,
    ModuleObservabilityScope,
    nullLog,
    Observability,
    WithModuleObservabilityContext,
} from "@laoban/observability"
import {
    GenerationWalkSummary,
    GenerationalWalkConfig,
    GenerationalWalkVisitor,
    generationalWalk,
} from "./generational.reporter"

type Item = {
    name: string
}

type Input = {
    generations: Item[][]
}

type TestPurpose = ".log"
type TestReadChannel = unknown
type TestWriteChannel = unknown
type TestRef = unknown

type TestConfig = GenerationalWalkConfig<
    Input,
    Item,
    TestPurpose,
    TestReadChannel,
    TestWriteChannel,
    TestRef
>

type TestContext = WithModuleObservabilityContext<
    TestPurpose,
    TestReadChannel,
    TestWriteChannel,
    TestRef
>

const issue = (message: string): BaseIssue => ({message})

function testObservability(
    countMetrics: string[] = [],
): Observability {
    return makeObservability({
        context: {
            correlationId: "test",
            moduleScope: defaultModuleObservabilityScope(undefined, "."),
            debugConfig: {},
            timeService: {now: () => 0},
            observabilityTemplates: {},
            dictionary: {},
        },
        target: {write: nullLog},
        countMetric: name => countMetrics.push(name),
    })
}

function fakeChannelObservability(
    observability: Observability,
    moduleScope: ModuleObservabilityScope,
): ChannelObservability {
    return {
        ...observability,
        moduleScope,
        close: jest.fn(async () => value(undefined)),
    } as unknown as ChannelObservability
}

function testConfig(
    overrides: Partial<TestConfig> = {},
    countMetrics: string[] = [],
): TestConfig {
    const observability = testObservability(countMetrics)

    const context: TestContext = {
        observability,
        channelsState: {} as any,
    }

    return {
        ...context,

        load: jest.fn(async () =>
            value({
                generations: [
                    [{name: "a"}, {name: "b"}],
                    [{name: "c"}],
                ],
            }),
        ),

        toGenerations: jest.fn((input: Input) =>
            value(input.generations),
        ),

        toModuleScope: jest.fn((_input: Input, item: Item) =>
            defaultModuleObservabilityScope(item.name, `/modules/${item.name}`),
        ),

        withItemObservability: jest.fn(async (moduleScope, fn) =>
            fn(fakeChannelObservability(observability, moduleScope)),
        ),

        flush: jest.fn(async () => value(undefined)),

        continueOnGenerationError: true,

        ...overrides,
    }
}

function testVisitor(
    overrides: Partial<GenerationalWalkVisitor<Input, Item>> = {},
): GenerationalWalkVisitor<Input, Item> {
    return {
        visit: jest.fn(async () => value(undefined)),
        ...overrides,
    }
}

describe("generationalWalk", () => {
    it("loads input, converts it to generations, visits every item, wraps each item in module observability, and flushes after each generation plus once at the end", async () => {
        const config = testConfig()
        const visitor = testVisitor()

        const result = await generationalWalk(config, visitor)

        expect(result).toEqual(value(undefined))

        expect(config.load).toHaveBeenCalledTimes(1)

        expect(config.toGenerations).toHaveBeenCalledTimes(1)
        expect(config.toGenerations).toHaveBeenCalledWith({
            generations: [
                [{name: "a"}, {name: "b"}],
                [{name: "c"}],
            ],
        })

        expect(config.toModuleScope).toHaveBeenCalledTimes(3)
        expect(config.toModuleScope).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            {name: "a"},
        )
        expect(config.toModuleScope).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            {name: "b"},
        )
        expect(config.toModuleScope).toHaveBeenNthCalledWith(
            3,
            expect.anything(),
            {name: "c"},
        )

        expect(config.withItemObservability).toHaveBeenCalledTimes(3)
        expect(config.withItemObservability).toHaveBeenNthCalledWith(
            1,
            defaultModuleObservabilityScope("a", "/modules/a"),
            expect.any(Function),
        )
        expect(config.withItemObservability).toHaveBeenNthCalledWith(
            2,
            defaultModuleObservabilityScope("b", "/modules/b"),
            expect.any(Function),
        )
        expect(config.withItemObservability).toHaveBeenNthCalledWith(
            3,
            defaultModuleObservabilityScope("c", "/modules/c"),
            expect.any(Function),
        )

        expect(visitor.visit).toHaveBeenCalledTimes(3)
        expect(visitor.visit).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            {name: "a"},
            expect.objectContaining({
                moduleScope: expect.objectContaining({
                    module: "a",
                    directory: "/modules/a",
                }),
            }),
        )
        expect(visitor.visit).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            {name: "b"},
            expect.objectContaining({
                moduleScope: expect.objectContaining({
                    module: "b",
                    directory: "/modules/b",
                }),
            }),
        )
        expect(visitor.visit).toHaveBeenNthCalledWith(
            3,
            expect.anything(),
            {name: "c"},
            expect.objectContaining({
                moduleScope: expect.objectContaining({
                    module: "c",
                    directory: "/modules/c",
                }),
            }),
        )

        expect(config.flush).toHaveBeenCalledTimes(3)
    })

    it("does not call toGenerations, visit, withItemObservability, or flush when load fails", async () => {
        const loadError = issue("load failed")
        const config = testConfig({
            load: jest.fn(async () => errors(loadError)),
        })
        const visitor = testVisitor()

        const result = await generationalWalk(config, visitor)

        expect(result).toEqual(errors(loadError))
        expect(config.toGenerations).not.toHaveBeenCalled()
        expect(config.toModuleScope).not.toHaveBeenCalled()
        expect(config.withItemObservability).not.toHaveBeenCalled()
        expect(visitor.visit).not.toHaveBeenCalled()
        expect(config.flush).not.toHaveBeenCalled()
    })

    it("does not visit or flush when toGenerations fails, but preserves load and planning warnings", async () => {
        const loadWarning = issue("load warning")
        const planningWarning = issue("planning warning")
        const planningError = issue("planning failed")

        const config = testConfig({
            load: jest.fn(async () =>
                value({generations: []}, [loadWarning]),
            ),
            toGenerations: jest.fn(() =>
                errors(planningError, [], [planningWarning]),
            ),
        })
        const visitor = testVisitor()

        const result = await generationalWalk(config, visitor)

        expect(result).toEqual(errors(planningError, [], [loadWarning, planningWarning]))
        expect(config.withItemObservability).not.toHaveBeenCalled()
        expect(visitor.visit).not.toHaveBeenCalled()
        expect(config.flush).not.toHaveBeenCalled()
    })

    it("runs all items in a generation before flushing that generation", async () => {
        const calls: string[] = []

        const config = testConfig({
            flush: jest.fn(async () => {
                calls.push("flush")
                return value(undefined)
            }),
        })

        const visitor = testVisitor({
            visit: jest.fn(async (_input, item) => {
                calls.push(`visit:${item.name}`)
                return value(undefined)
            }),
        })

        await generationalWalk(config, visitor)

        expect(calls).toEqual([
            "visit:a",
            "visit:b",
            "flush",
            "visit:c",
            "flush",
            "flush",
        ])
    })

    it("does not start the next generation until the current generation has finished and flushed", async () => {
        const calls: string[] = []
        let releaseA!: () => void

        const aFinished = new Promise<void>(resolve => {
            releaseA = resolve
        })

        const config = testConfig({
            flush: jest.fn(async () => {
                calls.push("flush")
                return value(undefined)
            }),
        })

        const visitor = testVisitor({
            visit: jest.fn(async (_input, item) => {
                calls.push(`start:${item.name}`)

                if (item.name === "a")
                    await aFinished

                calls.push(`end:${item.name}`)
                return value(undefined)
            }),
        })

        const walkPromise = generationalWalk(config, visitor)

        await Promise.resolve()
        await Promise.resolve()

        expect(calls).toEqual([
            "start:a",
            "start:b",
            "end:b",
        ])

        releaseA()

        await walkPromise

        expect(calls).toEqual([
            "start:a",
            "start:b",
            "end:b",
            "end:a",
            "flush",
            "start:c",
            "end:c",
            "flush",
            "flush",
        ])
    })

    it("continues to later generations by default when a generation has errors", async () => {
        const visitError = issue("b failed")
        const displayedErrors: BaseIssue[][] = []

        const config = testConfig()

        const visitor = testVisitor({
            visit: jest.fn(async (_input, item) =>
                item.name === "b"
                    ? errors(visitError)
                    : value(undefined),
            ),
            displayGenerationErrors: jest.fn(async (_input, _generationIndex, _generation, generationErrors) => {
                displayedErrors.push(generationErrors)
                return value(undefined)
            }),
        })

        const result = await generationalWalk(config, visitor)

        expect(visitor.visit).toHaveBeenCalledTimes(3)
        expect(config.flush).toHaveBeenCalledTimes(3)
        expect(visitor.displayGenerationErrors).toHaveBeenCalledTimes(1)
        expect(displayedErrors).toEqual([[visitError]])

        expect(isErrors(result)).toBe(true)
        if (isErrors(result))
            expect(result.errors).toEqual([visitError])
    })

    it("stops after a failing generation when continueOnGenerationError is false", async () => {
        const visitError = issue("b failed")

        const config = testConfig({
            continueOnGenerationError: false,
        })

        const visitor = testVisitor({
            visit: jest.fn(async (_input, item) =>
                item.name === "b"
                    ? errors(visitError)
                    : value(undefined),
            ),
            displayGenerationErrors: jest.fn(async () => value(undefined)),
        })

        const result = await generationalWalk(config, visitor)

        expect(visitor.visit).toHaveBeenCalledTimes(2)
        expect(visitor.visit).toHaveBeenCalledWith(
            expect.anything(),
            {name: "a"},
            expect.anything(),
        )
        expect(visitor.visit).toHaveBeenCalledWith(
            expect.anything(),
            {name: "b"},
            expect.anything(),
        )
        expect(visitor.visit).not.toHaveBeenCalledWith(
            expect.anything(),
            {name: "c"},
            expect.anything(),
        )

        expect(config.flush).toHaveBeenCalledTimes(2)

        expect(isErrors(result)).toBe(true)
        if (isErrors(result))
            expect(result.errors).toEqual([visitError])
    })

    it("includes flush errors in generation errors and final result", async () => {
        const flushError = issue("flush failed")

        const config = testConfig({
            flush: jest.fn()
                .mockResolvedValueOnce(errors(flushError))
                .mockResolvedValue(value(undefined)),
        })

        const visitor = testVisitor({
            displayGenerationErrors: jest.fn(async () => value(undefined)),
        })

        const result = await generationalWalk(config, visitor)

        expect(visitor.displayGenerationErrors).toHaveBeenCalledTimes(1)
        expect(visitor.displayGenerationErrors).toHaveBeenCalledWith(
            expect.anything(),
            0,
            [{name: "a"}, {name: "b"}],
            [flushError],
            config.observability,
        )

        expect(isErrors(result)).toBe(true)
        if (isErrors(result))
            expect(result.errors).toEqual([flushError])
    })

    it("preserves warnings from load, planning, visits, flush, generation-error display, summary and final issues", async () => {
        const loadWarning = issue("load warning")
        const planningWarning = issue("planning warning")
        const visitWarning = issue("visit warning")
        const flushWarning = issue("flush warning")
        const generationDisplayWarning = issue("generation display warning")
        const summaryWarning = issue("summary warning")
        const finalIssuesWarning = issue("final issues warning")
        const visitError = issue("visit error")

        const config = testConfig({
            load: jest.fn(async () =>
                value({
                    generations: [
                        [{name: "a"}],
                    ],
                }, [loadWarning]),
            ),
            toGenerations: jest.fn(input =>
                value(input.generations, [planningWarning]),
            ),
            flush: jest.fn(async () =>
                value(undefined, [flushWarning]),
            ),
        })

        const visitor = testVisitor({
            visit: jest.fn(async () =>
                errors(visitError, [], [visitWarning]),
            ),
            displayGenerationErrors: jest.fn(async () =>
                value(undefined, [generationDisplayWarning]),
            ),
            displaySummary: jest.fn(async () =>
                value(undefined, [summaryWarning]),
            ),
            displayFinalIssues: jest.fn(async () =>
                value(undefined, [finalIssuesWarning]),
            ),
        })

        const result = await generationalWalk(config, visitor)

        expect(isErrors(result)).toBe(true)

        if (isErrors(result)) {
            expect(result.errors).toEqual([visitError])
            expect(result.warnings).toEqual([
                loadWarning,
                planningWarning,
                visitWarning,
                flushWarning,
                generationDisplayWarning,
                flushWarning,
                summaryWarning,
                finalIssuesWarning,
            ])
        }

        expect(warnings(result)).toContain(loadWarning)
        expect(warnings(result)).toContain(planningWarning)
        expect(warnings(result)).toContain(visitWarning)
        expect(warnings(result)).toContain(flushWarning)
        expect(warnings(result)).toContain(generationDisplayWarning)
        expect(warnings(result)).toContain(summaryWarning)
        expect(warnings(result)).toContain(finalIssuesWarning)
    })

    it("passes a summary after the final flush", async () => {
        const calls: string[] = []
        let capturedSummary: GenerationWalkSummary | undefined

        const config = testConfig({
            flush: jest.fn(async () => {
                calls.push("flush")
                return value(undefined)
            }),
        })

        const visitor = testVisitor({
            visit: jest.fn(async (_input, item) => {
                calls.push(`visit:${item.name}`)
                return value(undefined)
            }),
            displaySummary: jest.fn(async (_input, summary) => {
                calls.push("summary")
                capturedSummary = summary
                return value(undefined)
            }),
        })

        await generationalWalk(config, visitor)

        expect(calls).toEqual([
            "visit:a",
            "visit:b",
            "flush",
            "visit:c",
            "flush",
            "flush",
            "summary",
        ])

        expect(capturedSummary).toEqual({
            generationCount: 2,
            plannedItemCount: 3,
            visitedItemCount: 3,
            errorCount: 0,
            warningCount: 0,
            stoppedEarly: false,
        })
    })

    it("calls displayFinalIssues when there are warnings but no errors", async () => {
        const visitWarning = issue("visit warning")

        const config = testConfig()
        const visitor = testVisitor({
            visit: jest.fn(async () => value(undefined, [visitWarning])),
            displayFinalIssues: jest.fn(async () => value(undefined)),
        })

        const result = await generationalWalk(config, visitor)

        expect(visitor.displayFinalIssues).toHaveBeenCalledTimes(1)
        expect(visitor.displayFinalIssues).toHaveBeenCalledWith(
            expect.anything(),
            [visitWarning, visitWarning, visitWarning],
            [],
            config.observability,
        )

        expect(result).toEqual(value(undefined, [visitWarning, visitWarning, visitWarning]))
    })

    it("calls displayFinalIssues when there are errors", async () => {
        const visitError = issue("visit error")

        const config = testConfig()
        const visitor = testVisitor({
            visit: jest.fn(async (_input, item) =>
                item.name === "a"
                    ? errors(visitError)
                    : value(undefined),
            ),
            displayFinalIssues: jest.fn(async () => value(undefined)),
        })

        const result = await generationalWalk(config, visitor)

        expect(visitor.displayFinalIssues).toHaveBeenCalledTimes(1)
        expect(visitor.displayFinalIssues).toHaveBeenCalledWith(
            expect.anything(),
            [],
            [visitError],
            config.observability,
        )

        expect(isErrors(result)).toBe(true)
        if (isErrors(result))
            expect(result.errors).toEqual([visitError])
    })

    it("adds displaySummary errors to the final result", async () => {
        const summaryError = issue("summary failed")

        const config = testConfig()
        const visitor = testVisitor({
            displaySummary: jest.fn(async () => errors(summaryError)),
        })

        const result = await generationalWalk(config, visitor)

        expect(isErrors(result)).toBe(true)
        if (isErrors(result))
            expect(result.errors).toEqual([summaryError])
    })

    it("adds displayFinalIssues errors to the final result", async () => {
        const visitWarning = issue("visit warning")
        const finalIssuesError = issue("final issues failed")

        const config = testConfig()
        const visitor = testVisitor({
            visit: jest.fn(async () => value(undefined, [visitWarning])),
            displayFinalIssues: jest.fn(async () => errors(finalIssuesError)),
        })

        const result = await generationalWalk(config, visitor)

        expect(isErrors(result)).toBe(true)
        if (isErrors(result))
            expect(result.errors).toEqual([finalIssuesError])
    })

    it("emits metrics from the summary", async () => {
        const countMetrics: string[] = []
        const config = testConfig({}, countMetrics)
        const visitor = testVisitor()

        await generationalWalk(config, visitor)

        expect(countMetrics).toEqual([
            "generationalWalk.generationCount.2",
            "generationalWalk.plannedItemCount.3",
            "generationalWalk.visitedItemCount.3",
            "generationalWalk.errorCount.0",
            "generationalWalk.warningCount.0",
        ])
    })

    it("emits stoppedEarly metric when stopped early", async () => {
        const countMetrics: string[] = []
        const visitError = issue("visit error")

        const config = testConfig({
            continueOnGenerationError: false,
        }, countMetrics)

        const visitor = testVisitor({
            visit: jest.fn(async (_input, item) =>
                item.name === "a"
                    ? errors(visitError)
                    : value(undefined),
            ),
        })

        await generationalWalk(config, visitor)

        expect(countMetrics).toContain("generationalWalk.stoppedEarly")
        expect(countMetrics).toContain("generationalWalk.visitedItemCount.2")
    })

    it("handles empty generations", async () => {
        const countMetrics: string[] = []

        const config = testConfig({
            load: jest.fn(async () =>
                value({generations: []}),
            ),
        }, countMetrics)

        const visitor = testVisitor({
            displaySummary: jest.fn(async () => value(undefined)),
        })

        const result = await generationalWalk(config, visitor)

        expect(result).toEqual(value(undefined))
        expect(visitor.visit).not.toHaveBeenCalled()
        expect(config.withItemObservability).not.toHaveBeenCalled()
        expect(config.flush).toHaveBeenCalledTimes(1)

        expect(visitor.displaySummary).toHaveBeenCalledWith(
            {generations: []},
            {
                generationCount: 0,
                plannedItemCount: 0,
                visitedItemCount: 0,
                errorCount: 0,
                warningCount: 0,
                stoppedEarly: false,
            },
            config.observability,
        )

        expect(countMetrics).toEqual([
            "generationalWalk.generationCount.0",
            "generationalWalk.plannedItemCount.0",
            "generationalWalk.visitedItemCount.0",
            "generationalWalk.errorCount.0",
            "generationalWalk.warningCount.0",
        ])
    })
})