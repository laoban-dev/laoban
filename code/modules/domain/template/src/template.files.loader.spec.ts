import {
    BaseIssue,
    errors,
    errorsOrThrow,
    isErrors,
    isFileIssue,
    value,
    valueOrThrow,
} from "@laoban/errors"
import {ICodec} from "@laoban/codec"
import {FileOpIssue, FileOps} from "@laoban/files"
import {nullObservability} from "@laoban/observability"
import {
    loadedTemplateDeclaration,
    loadNormalisedTemplate,
    LoadNormalisedTemplateConfig,
    templateSource,
    unknownTemplateMessage,
} from "./template.for.files.loader"

describe("template file loading", () => {
    const observability = nullObservability()

    const templateFile = "@laoban@/templates/typescript/template.json"

    const validTemplateDeclaration = {
        defaultSrcPrefix: "@laoban@/templates/typescript",
        description: "Typescript template",
        files: {
            "README.md": {
                type: "copy",
                source: "./README.template.md",
                template: {
                    as: "{{}}",
                },
            },
            "package.json": {
                type: "merge",
                source: "./package.json",
                fileType: "json",
            },
        },
    }

    function toExpectedFileIssue(error: BaseIssue) {
        expect(isFileIssue(error)).toBe(true)

        if (!isFileIssue(error))
            throw new Error(`Expected file issue: ${JSON.stringify(error)}`)

        return {
            kind: error.kind,
            code: error.code,
            context: error.context,
            message: error.message,
            diagnosticContext: error.diagnosticContext,
        }
    }

    function loadTextMock(
        fn: FileOps["loadText"] = async () => value<string, FileOpIssue>(
            JSON.stringify(validTemplateDeclaration),
        ),
    ): jest.MockedFunction<FileOps["loadText"]> {
        return jest.fn(fn) as jest.MockedFunction<FileOps["loadText"]>
    }

    function jsonCodec(
        overrides: Partial<ICodec<unknown>> = {},
    ): ICodec<unknown> {
        return {
            decode: jest.fn((text: string) => value(JSON.parse(text))),
            encode: jest.fn((input: unknown) => value(JSON.stringify(input))),
            ...overrides,
        } as unknown as ICodec<unknown>
    }

    function makeConfig(
        overrides: Partial<LoadNormalisedTemplateConfig> = {},
    ): LoadNormalisedTemplateConfig {
        return {
            observability,
            fileOps: {
                loadText: loadTextMock(),
            },
            loadTextConfig: {
                observability,
            },
            jsonCodec: jsonCodec(),
            ...overrides,
        }
    }

    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe("loadNormalisedTemplate", () => {
        it("loads, decodes, validates and normalises a template", async () => {
            const config = makeConfig()

            const result = await loadNormalisedTemplate(config, {
                templates: {
                    typescript: templateFile,
                },
                templateName: "typescript",
                requestedBy: "package alpha",
            })

            expect(valueOrThrow(result)).toEqual({
                name: "typescript",
                source: templateFile,
                files: {
                    "README.md": {
                        type: "copy",
                        target: "README.md",
                        source: "./README.template.md",
                        template: {
                            as: "{{}}",
                        },
                        deprecated: false,
                    },
                    "package.json": {
                        type: "merge",
                        target: "package.json",
                        source: "./package.json",
                        fileType: "json",
                        deprecated: false,
                    },
                },
            })

            expect(config.fileOps.loadText).toHaveBeenCalledTimes(1)
            expect(config.fileOps.loadText).toHaveBeenCalledWith(
                templateFile,
                config.loadTextConfig,
            )

            expect(config.jsonCodec.decode).toHaveBeenCalledTimes(1)
            expect(config.jsonCodec.decode).toHaveBeenCalledWith(
                JSON.stringify(validTemplateDeclaration),
                observability,
            )
        })

        it("preserves validation warnings from legacy templates", async () => {
            const legacyTemplateDeclaration = {
                defaultSrcPrefix: "@laoban@/templates/typescript",
                files: {
                    "index.ts": {
                        sample: true,
                    },
                    "package.json": {
                        file: "./package.json",
                        template: "${}",
                        mergeWithParent: "json",
                        postProcess: "packageJson(@laoban@/templates/javascript/package.json)",
                    },
                },
            }

            const config = makeConfig({
                fileOps: {
                    loadText: loadTextMock(async () =>
                        value<string, FileOpIssue>(JSON.stringify(legacyTemplateDeclaration)),
                    ),
                },
            })

            const result = await loadNormalisedTemplate(config, {
                templates: {
                    typescript: templateFile,
                },
                templateName: "typescript",
                requestedBy: "package alpha",
            })

            expect(valueOrThrow(result)).toEqual({
                name: "typescript",
                source: templateFile,
                files: {
                    "index.ts": {
                        type: "copy",
                        target: "index.ts",
                        source: "@laoban@/templates/typescript/index.ts",
                        overwrite: false,
                        deprecated: true,
                    },
                    "package.json": {
                        type: "merge",
                        target: "package.json",
                        source: "./package.json",
                        fileType: "json",
                        template: {
                            as: "${}",
                        },
                        deprecated: true,
                    },
                },
            })

            expect(result.warnings?.map(warning => ({
                code: warning.code,
                severity: warning.severity,
                context: warning.context,
            }))).toEqual([
                {
                    code: "deprecated",
                    severity: "warning",
                    context: ["files", "index.ts"],
                },
                {
                    code: "deprecated",
                    severity: "warning",
                    context: ["files", "package.json"],
                },
                {
                    code: "deprecated",
                    severity: "warning",
                    context: ["files", "package.json", "postProcess"],
                },
            ])
        })

        it("returns an unknown template error before loading", async () => {
            const config = makeConfig()

            const result = await loadNormalisedTemplate(config, {
                templates: {
                    javascript: "@laoban@/templates/javascript/template.json",
                    typescript: templateFile,
                },
                templateName: "react",
                requestedBy: "package alpha",
            })

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "unknownTemplate",
                    message: "Unknown template 'react' requested by package alpha",
                    context: {
                        templateName: "react",
                        requestedBy: "package alpha",
                        availableTemplates: ["javascript", "typescript"],
                    },
                },
            ])

            expect(config.fileOps.loadText).not.toHaveBeenCalled()
            expect(config.jsonCodec.decode).not.toHaveBeenCalled()
        })

        it("returns loadText errors", async () => {
            const issue: FileOpIssue = {
                kind: "io",
                message: "Could not load template file",
                context: {
                    operation: "loadText",
                },
                diagnosticContext: {
                    currentFile: templateFile,
                },
                severity: "error",
            }

            const config = makeConfig({
                fileOps: {
                    loadText: loadTextMock(async () => errors(issue)),
                },
            })

            const result = await loadNormalisedTemplate(config, {
                templates: {
                    typescript: templateFile,
                },
                templateName: "typescript",
                requestedBy: "package alpha",
            })

            expect(result).toEqual(errors(issue))
            expect(config.jsonCodec.decode).not.toHaveBeenCalled()
        })

        it("returns JSON decode errors", async () => {
            const issue = {
                kind: "json" as const,
                message: "Invalid JSON",
                context: {
                    input: "{ nope",
                },
                severity: "error" as const,
            }

            const codec = jsonCodec({
                decode: jest.fn(() => errors(issue)),
            })

            const config = makeConfig({
                fileOps: {
                    loadText: loadTextMock(async () => value<string, FileOpIssue>("{ nope")),
                },
                jsonCodec: codec,
            })

            const result = await loadNormalisedTemplate(config, {
                templates: {
                    typescript: templateFile,
                },
                templateName: "typescript",
                requestedBy: "package alpha",
            })

            expect(result).toEqual(errors(issue))
        })

        it("returns validation errors from decoded JSON", async () => {
            const invalidTemplateDeclaration = {
                description: "No files",
            }

            const config = makeConfig({
                fileOps: {
                    loadText: loadTextMock(async () =>
                        value<string, FileOpIssue>(JSON.stringify(invalidTemplateDeclaration)),
                    ),
                },
            })

            const result = await loadNormalisedTemplate(config, {
                templates: {
                    typescript: templateFile,
                },
                templateName: "typescript",
                requestedBy: "package alpha",
            })

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(toExpectedFileIssue)).toEqual([
                {
                    kind: "validation",
                    code: "required",
                    context: ["files"],
                    message: "files is required but was undefined",
                    diagnosticContext: {
                        currentFile: templateFile,
                    },
                },
            ])
        })
    })

    describe("templateSource", () => {
        it("returns the configured source for a template name", () => {
            const result = templateSource({
                templates: {
                    typescript: templateFile,
                },
                templateName: "typescript",
                requestedBy: "package alpha",
            })

            expect(valueOrThrow(result)).toBe(templateFile)
        })

        it("returns available template names sorted when the template is unknown", () => {
            const result = templateSource({
                templates: {
                    zeta: "z/template.json",
                    alpha: "a/template.json",
                },
                templateName: "missing",
                requestedBy: "package beta",
            })

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "unknownTemplate",
                    message: "Unknown template 'missing' requested by package beta",
                    context: {
                        templateName: "missing",
                        requestedBy: "package beta",
                        availableTemplates: ["alpha", "zeta"],
                    },
                },
            ])
        })
    })

    describe("unknownTemplateMessage", () => {
        it("includes the requestedBy text", () => {
            expect(unknownTemplateMessage({
                templates: {},
                templateName: "typescript",
                requestedBy: "package alpha",
            })).toBe("Unknown template 'typescript' requested by package alpha")
        })
    })

    describe("loadedTemplateDeclaration", () => {
        it("builds a loaded template declaration", () => {
            expect(loadedTemplateDeclaration(
                "typescript",
                templateFile,
                validTemplateDeclaration as any,
            )).toEqual({
                name: "typescript",
                source: templateFile,
                declaration: validTemplateDeclaration,
            })
        })
    })
})