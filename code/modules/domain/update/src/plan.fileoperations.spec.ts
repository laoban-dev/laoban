import {errors, isErrors, value, valueOrThrow} from "@laoban/errors"
import {
    NormalisedTemplateDeclaration,
    TemplateFileOperation,
} from "@laoban/template_files"
import {throttlePlan} from "@laoban/topologicalsort"
import {
    flattenPlannedPackageFiles,
    planLoadedManagedFiles,
    planManagedFileBatches,
    PlanManagedFilesConfig,
} from "./plan.file.operations"

describe("planLoadedManagedFiles", () => {
    const loadedConfig = {
        config: {},
        directory: "/workspace",
    } as any

    const alpha = loadedPackage("alpha")
    const beta = loadedPackage("beta")
    const gamma = loadedPackage("gamma")

    const loadedProject = {
        loadedLaobanConfig: loadedConfig,
        loadedPackageDetails: {
            alpha,
            beta,
            gamma,
        },
    } as any

    function loadedPackage(name: string) {
        return {
            packageFile: `/workspace/packages/${name}/package.details.json`,
            dir: `/workspace/packages/${name}`,
            contents: {
                template: "default",
                name,
                links: [],
                devLinks: [],
                peerLinks: [],
                allLinks: [],
                guards: {},
                files: {},
                meta: {},
            },
        } as any
    }

    function copyOperation(
        overrides: Partial<Extract<TemplateFileOperation, {type: "copy"}>> = {},
    ): Extract<TemplateFileOperation, {type: "copy"}> {
        return {
            type: "copy",
            target: "README.md",
            source: "README.template.md",
            deprecated: false,
            ...overrides,
        }
    }

    function normalisedTemplate(
        name = "default",
        files: Record<string, TemplateFileOperation> = {
            "README.md": copyOperation(),
        },
    ): NormalisedTemplateDeclaration {
        return {
            name,
            source: `${name}.template.json`,
            files,
        }
    }

    function makeConfig(overrides: Partial<PlanManagedFilesConfig> = {}): PlanManagedFilesConfig {
        return {
            laobanConfigLoadConfig: {} as any,
            loadConfig: jest.fn() as any,
            loadPackages: jest.fn() as any,
            throttlePlan,
            throttle: 2,
            loadTemplate: jest.fn(async ({templateName}) =>
                value(normalisedTemplate(templateName)),
            ),
            planTemplateFileOperation: jest.fn(async ({loadedPackageDetail, fileName}) =>
                value([
                    {
                        filename: `${loadedPackageDetail.dir}/${fileName}`,
                        content: `content for ${loadedPackageDetail.contents.name}`,
                    },
                ]),
            ),
            consumeBatch: jest.fn(async ({files}) =>
                value({
                    files: files.length,
                }),
            ),
            ...overrides,
        }
    }

    it("plans and consumes files in throttle batches", async () => {
        const config = makeConfig()

        const result = await planLoadedManagedFiles(config, loadedProject)

        expect(valueOrThrow(result)).toEqual({
            batches: 2,
            packages: 3,
            files: 3,
        })

        expect(config.loadTemplate).toHaveBeenCalledTimes(3)
        expect(config.planTemplateFileOperation).toHaveBeenCalledTimes(3)
        expect(config.consumeBatch).toHaveBeenCalledTimes(2)

        expect(config.consumeBatch).toHaveBeenNthCalledWith(1, {
            batchNumber: 0,
            packages: [
                {
                    packageName: "alpha",
                    templateName: "default",
                    files: [
                        {
                            packageName: "alpha",
                            templateName: "default",
                            fileName: "README.md",
                            writes: [
                                {
                                    filename: "/workspace/packages/alpha/README.md",
                                    content: "content for alpha",
                                },
                            ],
                        },
                    ],
                },
                {
                    packageName: "beta",
                    templateName: "default",
                    files: [
                        {
                            packageName: "beta",
                            templateName: "default",
                            fileName: "README.md",
                            writes: [
                                {
                                    filename: "/workspace/packages/beta/README.md",
                                    content: "content for beta",
                                },
                            ],
                        },
                    ],
                },
            ],
            files: [
                {
                    filename: "/workspace/packages/alpha/README.md",
                    content: "content for alpha",
                },
                {
                    filename: "/workspace/packages/beta/README.md",
                    content: "content for beta",
                },
            ],
        })

        expect(config.consumeBatch).toHaveBeenNthCalledWith(2, {
            batchNumber: 1,
            packages: [
                {
                    packageName: "gamma",
                    templateName: "default",
                    files: [
                        {
                            packageName: "gamma",
                            templateName: "default",
                            fileName: "README.md",
                            writes: [
                                {
                                    filename: "/workspace/packages/gamma/README.md",
                                    content: "content for gamma",
                                },
                            ],
                        },
                    ],
                },
            ],
            files: [
                {
                    filename: "/workspace/packages/gamma/README.md",
                    content: "content for gamma",
                },
            ],
        })
    })

    it("does not retain batch output beyond the consumer contract", async () => {
        const consumedFileNames: string[][] = []

        const config = makeConfig({
            consumeBatch: jest.fn(async ({files}) => {
                consumedFileNames.push(files.map(file => file.filename))
                return value({files: files.length})
            }),
        })

        const result = await planLoadedManagedFiles(config, loadedProject)

        expect(valueOrThrow(result)).toEqual({
            batches: 2,
            packages: 3,
            files: 3,
        })

        expect(consumedFileNames).toEqual([
            [
                "/workspace/packages/alpha/README.md",
                "/workspace/packages/beta/README.md",
            ],
            [
                "/workspace/packages/gamma/README.md",
            ],
        ])
    })

    it("passes loaded config, package detail, template and file operation to planTemplateFileOperation", async () => {
        const fileDef = copyOperation()

        const template = normalisedTemplate("default", {
            "README.md": fileDef,
        })

        const config = makeConfig({
            loadTemplate: jest.fn(async () => value(template)),
        })

        await planLoadedManagedFiles(config, loadedProject)

        expect(config.planTemplateFileOperation).toHaveBeenNthCalledWith(1, {
            loadedConfig,
            loadedPackageDetail: alpha,
            template,
            fileName: "README.md",
            fileDef,
        })
    })

    it("returns template load errors and does not consume that batch", async () => {
        const issue = {
            kind: "templateLoadFailed",
            message: "Could not load template",
        }

        const config = makeConfig({
            loadTemplate: jest.fn(async ({loadedPackageDetail}) =>
                loadedPackageDetail.contents.name === "beta"
                    ? errors(issue)
                    : value(normalisedTemplate("default", {})),
            ),
        })

        const result = await planLoadedManagedFiles(config, loadedProject)

        expect(isErrors(result)).toBe(true)
        expect(result).toEqual(errors(issue))
        expect(config.consumeBatch).not.toHaveBeenCalled()
    })

    it("consumes earlier successful batches before a later batch fails", async () => {
        const issue = {
            kind: "templateLoadFailed",
            message: "Could not load template",
        }

        const config = makeConfig({
            throttle: 2,
            loadTemplate: jest.fn(async ({loadedPackageDetail}) =>
                loadedPackageDetail.contents.name === "gamma"
                    ? errors(issue)
                    : value(normalisedTemplate("default", {})),
            ),
        })

        const result = await planLoadedManagedFiles(config, loadedProject)

        expect(result).toEqual(errors(issue))
        expect(config.consumeBatch).toHaveBeenCalledTimes(1)
        expect(config.consumeBatch).toHaveBeenNthCalledWith(1, {
            batchNumber: 0,
            packages: [
                {
                    packageName: "alpha",
                    templateName: "default",
                    files: [],
                },
                {
                    packageName: "beta",
                    templateName: "default",
                    files: [],
                },
            ],
            files: [],
        })
    })

    it("returns template file operation planning errors and does not consume that batch", async () => {
        const issue = {
            kind: "filePlanFailed",
            message: "Could not plan file",
        }

        const config = makeConfig({
            planTemplateFileOperation: jest.fn(async ({loadedPackageDetail}) =>
                loadedPackageDetail.contents.name === "alpha"
                    ? errors(issue)
                    : value([]),
            ),
        })

        const result = await planLoadedManagedFiles(config, loadedProject)

        expect(isErrors(result)).toBe(true)
        expect(result).toEqual(errors(issue))
        expect(config.consumeBatch).not.toHaveBeenCalled()
    })

    it("returns consumer errors and stops processing later batches", async () => {
        const issue = {
            kind: "consumeFailed",
            message: "Could not consume batch",
        }

        const config = makeConfig({
            consumeBatch: jest.fn(async ({batchNumber}) =>
                batchNumber === 0
                    ? errors(issue)
                    : value({files: 0}),
            ),
        })

        const result = await planLoadedManagedFiles(config, loadedProject)

        expect(result).toEqual(errors(issue))
        expect(config.consumeBatch).toHaveBeenCalledTimes(1)
        expect(config.loadTemplate).toHaveBeenCalledTimes(2)
        expect(config.planTemplateFileOperation).toHaveBeenCalledTimes(2)
    })

    it("uses throttlePlan validation and rejects invalid throttle values", async () => {
        const config = makeConfig({
            throttle: 0,
        })

        await expect(
            planLoadedManagedFiles(config, loadedProject),
        ).rejects.toThrow("Throttle must be a positive integer")
    })
})

describe("planManagedFileBatches", () => {
    function copyOperation(
        overrides: Partial<Extract<TemplateFileOperation, {type: "copy"}>> = {},
    ): Extract<TemplateFileOperation, {type: "copy"}> {
        return {
            type: "copy",
            target: "README.md",
            source: "README.template.md",
            deprecated: false,
            ...overrides,
        }
    }

    function normalisedTemplate(
        name = "default",
        files: Record<string, TemplateFileOperation> = {
            "README.md": copyOperation(),
        },
    ): NormalisedTemplateDeclaration {
        return {
            name,
            source: `${name}.template.json`,
            files,
        }
    }

    it("processes explicit batches sequentially", async () => {
        const loadedConfig = {
            config: {},
            directory: "/workspace",
        } as any

        const alpha = {
            packageFile: "/workspace/packages/alpha/package.details.json",
            dir: "/workspace/packages/alpha",
            contents: {
                template: "default",
                name: "alpha",
                links: [],
                devLinks: [],
                peerLinks: [],
                allLinks: [],
                guards: {},
                files: {},
                meta: {},
            },
        } as any

        const beta = {
            packageFile: "/workspace/packages/beta/package.details.json",
            dir: "/workspace/packages/beta",
            contents: {
                template: "default",
                name: "beta",
                links: [],
                devLinks: [],
                peerLinks: [],
                allLinks: [],
                guards: {},
                files: {},
                meta: {},
            },
        } as any

        const loadedProject = {
            loadedLaobanConfig: loadedConfig,
            loadedPackageDetails: {
                alpha,
                beta,
            },
        } as any

        const events: string[] = []

        const config = {
            laobanConfigLoadConfig: {} as any,
            loadConfig: jest.fn() as any,
            loadPackages: jest.fn() as any,
            throttlePlan,
            throttle: 1,
            loadTemplate: jest.fn(async ({loadedPackageDetail}) => {
                events.push(`loadTemplate:${loadedPackageDetail.contents.name}`)
                return value(normalisedTemplate())
            }),
            planTemplateFileOperation: jest.fn(async ({loadedPackageDetail}) => {
                events.push(`planFile:${loadedPackageDetail.contents.name}`)
                return value([
                    {
                        filename: `${loadedPackageDetail.dir}/README.md`,
                        content: loadedPackageDetail.contents.name,
                    },
                ])
            }),
            consumeBatch: jest.fn(async ({files}) => {
                events.push(`consume:${files.map(file => file.content).join(",")}`)
                return value({files: files.length})
            }),
        } as any

        const result = await planManagedFileBatches(
            config,
            loadedProject,
            [[alpha], [beta]],
        )

        expect(valueOrThrow(result)).toEqual({
            batches: 2,
            packages: 2,
            files: 2,
        })

        expect(events).toEqual([
            "loadTemplate:alpha",
            "planFile:alpha",
            "consume:alpha",
            "loadTemplate:beta",
            "planFile:beta",
            "consume:beta",
        ])
    })
})

describe("flattenPlannedPackageFiles", () => {
    it("flattens planned package files to writes", () => {
        expect(flattenPlannedPackageFiles([
            {
                packageName: "alpha",
                templateName: "default",
                files: [
                    {
                        packageName: "alpha",
                        templateName: "default",
                        fileName: "README.md",
                        writes: [
                            {filename: "alpha/README.md", content: "alpha"},
                        ],
                    },
                    {
                        packageName: "alpha",
                        templateName: "default",
                        fileName: ".gitignore",
                        writes: [],
                    },
                ],
            },
            {
                packageName: "beta",
                templateName: "default",
                files: [
                    {
                        packageName: "beta",
                        templateName: "default",
                        fileName: "README.md",
                        writes: [
                            {filename: "beta/README.md", content: "beta"},
                        ],
                    },
                ],
            },
        ] as any)).toEqual([
            {filename: "alpha/README.md", content: "alpha"},
            {filename: "beta/README.md", content: "beta"},
        ])
    })
})