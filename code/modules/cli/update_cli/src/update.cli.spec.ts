import {errors, isErrors, value, valueOrThrow} from "@laoban/errors"
import {makeLaobanUpdateCommand, defaultLaobanUpdateConfig, LaobanUpdateCliContext} from "./update.cli"

function makeContext(overrides: Partial<LaobanUpdateCliContext> = {}): LaobanUpdateCliContext {
    return {
        start: "/workspace",

        observability: {
            log: jest.fn(),
            debug: jest.fn(),
            countMetric: jest.fn(),
            durationMetric: jest.fn(),
            timeService: {
                now: jest.fn(() => 1000),
            },
        } as any,

        planManagedFiles: jest.fn(async (_config, _start) =>
            value({
                batches: 2,
                packages: 3,
                files: 4,
            }),
        ) as any,

        updateManagedFiles: jest.fn(async (_config, files) =>
            value({
                files: files.length,
            }),
        ) as any,

        loadTemplate: jest.fn() as any,
        planTemplateFileOperation: jest.fn() as any,
        throttlePlan: jest.fn() as any,
        throttle: 5,
        consumeBatch: jest.fn() as any,

        fileOps: {} as any,
        fileOpsHelperConfig: {} as any,
        loadTextConfig: {} as any,
        jsonCodec: {} as any,
        codecs: {} as any,
        fns: {} as any,
        templateEngine: jest.fn() as any,
        templateTypes: {} as any,

        loadConfig: jest.fn() as any,
        loadPackages: jest.fn() as any,
        laobanConfigLoadConfig: {} as any,

        debug: false,
        dryRun: false,

        ...overrides,
    } as LaobanUpdateCliContext
}

async function executeUpdate(
    values: {
        debug: boolean
        dryRun: boolean
        throttle: number
    },
    context: LaobanUpdateCliContext,
) {
    const command = makeLaobanUpdateCommand<LaobanUpdateCliContext>()

    return command.execute(
        values,
        context,
    )
}

describe("makeLaobanUpdateCommand", () => {
    it("plans and updates managed files", async () => {
        const updateManagedFiles = jest.fn(async (_config, files) =>
            value({
                files: files.length,
            }),
        )

        const planManagedFiles = jest.fn(async (config, _start) => {
            const consumed = await config.consumeBatch({
                batchNumber: 0,
                packages: [],
                files: [
                    {
                        filename: "/workspace/a/package.json",
                        content: "{}",
                    },
                ],
            })

            if (isErrors(consumed)) return consumed

            return value({
                batches: 1,
                packages: 1,
                files: consumed.value.files,
            })
        })

        const context = makeContext({
            planManagedFiles: planManagedFiles as any,
            updateManagedFiles: updateManagedFiles as any,
        })

        const result = await executeUpdate(
            {
                debug: true,
                dryRun: false,
                throttle: 7,
            },
            context,
        )

        expect(valueOrThrow(result)).toBeUndefined()

        expect(context.observability.log).toHaveBeenNthCalledWith(
            1,
            "Updating managed files from templates",
        )

        expect(planManagedFiles).toHaveBeenCalledTimes(1)
        expect(planManagedFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                throttle: 7,
            }),
            "/workspace",
        )

        expect(updateManagedFiles).toHaveBeenCalledTimes(1)
        expect(updateManagedFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                debug: true,
                dryRun: false,
            }),
            [
                {
                    filename: "/workspace/a/package.json",
                    content: "{}",
                },
            ],
        )

        expect(context.observability.log).toHaveBeenNthCalledWith(
            2,
            "Managed file update complete: batches=1, packages=1, files=1",
        )
    })

    it("logs dry-run start message and passes dryRun to updateManagedFiles", async () => {
        const updateManagedFiles = jest.fn(async (_config, files) =>
            value({
                files: files.length,
            }),
        )

        const planManagedFiles = jest.fn(async config => {
            const consumed = await config.consumeBatch({
                batchNumber: 0,
                packages: [],
                files: [
                    {
                        filename: "/workspace/a/README.md",
                        content: "hello",
                    },
                ],
            })

            if (isErrors(consumed)) return consumed

            return value({
                batches: 1,
                packages: 1,
                files: consumed.value.files,
            })
        })

        const context = makeContext({
            planManagedFiles: planManagedFiles as any,
            updateManagedFiles: updateManagedFiles as any,
        })

        const result = await executeUpdate(
            {
                debug: false,
                dryRun: true,
                throttle: 3,
            },
            context,
        )

        expect(valueOrThrow(result)).toBeUndefined()

        expect(context.observability.log).toHaveBeenNthCalledWith(
            1,
            "Planning managed file update in dry-run mode",
        )

        expect(planManagedFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                throttle: 3,
            }),
            "/workspace",
        )

        expect(updateManagedFiles).toHaveBeenCalledWith(
            expect.objectContaining({
                debug: false,
                dryRun: true,
            }),
            [
                {
                    filename: "/workspace/a/README.md",
                    content: "hello",
                },
            ],
        )

        expect(context.observability.log).toHaveBeenNthCalledWith(
            2,
            "Managed file update complete: batches=1, packages=1, files=1",
        )
    })

    it("returns plan errors and does not log completion", async () => {
        const issue = {
            kind: "planFailed",
            message: "Could not plan managed files",
        }

        const context = makeContext({
            planManagedFiles: jest.fn(async () => errors(issue)) as any,
            updateManagedFiles: jest.fn() as any,
        })

        const result = await executeUpdate(
            {
                debug: false,
                dryRun: false,
                throttle: 5,
            },
            context,
        )

        expect(result).toEqual(errors(issue))

        expect(context.observability.log).toHaveBeenCalledTimes(1)
        expect(context.observability.log).toHaveBeenCalledWith(
            "Updating managed files from templates",
        )
        expect(context.updateManagedFiles).not.toHaveBeenCalled()
    })

    it("returns update errors from consumeBatch and does not log completion", async () => {
        const issue = {
            kind: "writeFailed",
            message: "Could not write files",
        }

        const updateManagedFiles = jest.fn(async () => errors(issue))

        const planManagedFiles = jest.fn(async config => {
            const consumed = await config.consumeBatch({
                batchNumber: 0,
                packages: [],
                files: [
                    {
                        filename: "/workspace/a/package.json",
                        content: "{}",
                    },
                ],
            })

            if (isErrors(consumed)) return consumed

            return value({
                batches: 1,
                packages: 1,
                files: consumed.value.files,
            })
        })

        const context = makeContext({
            planManagedFiles: planManagedFiles as any,
            updateManagedFiles: updateManagedFiles as any,
        })

        const result = await executeUpdate(
            {
                debug: false,
                dryRun: false,
                throttle: 5,
            },
            context,
        )

        expect(result).toEqual(errors(issue))

        expect(updateManagedFiles).toHaveBeenCalledTimes(1)
        expect(context.observability.log).toHaveBeenCalledTimes(1)
        expect(context.observability.log).toHaveBeenCalledWith(
            "Updating managed files from templates",
        )
    })
})

describe("defaultLaobanUpdateConfig", () => {
    it("adds the default plan and update functions", () => {
        const config = defaultLaobanUpdateConfig({
            start: "/workspace",

            observability: {} as any,
            fileOps: {} as any,
            fileOpsHelperConfig: {} as any,
            loadTextConfig: {} as any,
            jsonCodec: {} as any,

            codecs: {} as any,
            fns: {} as any,
            templateEngine: jest.fn() as any,
            templateTypes: {} as any,

            loadTemplate: jest.fn() as any,
            planTemplateFileOperation: jest.fn() as any,
            throttlePlan: jest.fn() as any,
            throttle: 5,
            consumeBatch: jest.fn() as any,

            debug: false,
            dryRun: false,

            loadConfig: jest.fn() as any,
            loadPackages: jest.fn() as any,
            laobanConfigLoadConfig: {} as any,
        })

        expect(config.planManagedFiles).toBeDefined()
        expect(config.updateManagedFiles).toBeDefined()
        expect(typeof config.planManagedFiles).toBe("function")
        expect(typeof config.updateManagedFiles).toBe("function")
    })
})