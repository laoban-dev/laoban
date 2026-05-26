import {errorsOrThrow, isErrors, valueOrThrow, warnings} from "@laoban/errors"
import {nullObservability} from "@laoban/observability"
import {
    validateTemplateDeclaration,
    validateTemplateFileDeclaration,
} from "./template.for.files.validate"

describe("template file validators", () => {
    const observability = nullObservability()
    const currentFile = "template.json"

    describe("validateTemplateDeclaration", () => {
        it("accepts a template declaration using new copy and merge operations", () => {
            const declaration = {
                parent: [
                    {
                        src: "@laoban@/templates/javascript",
                        delete: ["index.js"],
                    },
                ],
                defaultSrcPrefix: "@laoban@/templates/typescript",
                description: "This is the template for typescript",
                documentation: "",
                repository: "",
                files: {
                    ".npmrc": {
                        type: "copy",
                        source: "@laoban@/templates/typescript/.npmrc",
                    },
                    "package.json": {
                        type: "merge",
                        source: "./package.json",
                        fileType: "json",
                        template: {
                            as: "${}",
                        },
                    },
                },
            } as any

            const result = validateTemplateDeclaration(currentFile, declaration, observability)

            expect(valueOrThrow(result)).toBe(declaration)
            expect(warnings(result)).toEqual([])
        })

        it("accepts all supported template syntaxes in new declarations", () => {
            const syntaxes = ["${}", "{{}}", ":", "<<>>"]

            for (const syntax of syntaxes) {
                const declaration = {
                    type: "copy",
                    source: "./README.md",
                    template: {
                        as: syntax,
                    },
                } as any

                const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

                expect(valueOrThrow(result)).toBe(declaration)
                expect(warnings(result)).toEqual([])
            }
        })

        it("accepts the old template declaration shape with deprecation warnings", () => {
            const declaration = {
                parent: [
                    {
                        src: "@laoban@/templates/javascript",
                        delete: ["index.js"],
                    },
                ],
                defaultSrcPrefix: "@laoban@/templates/typescript",
                description: "This is the template for typescript",
                documentation: "",
                repository: "",
                files: {
                    ".npmrc": {
                        postProcess: "checkEnv(NPM_TOKEN)",
                    },
                    "jest.config.json": {},
                    "tsconfig.json": {
                        file: "./tsconfig.json",
                    },
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
            } as any

            const result = validateTemplateDeclaration(currentFile, declaration, observability)

            expect(valueOrThrow(result)).toBe(declaration)

            expect(warnings(result).map(warning => ({
                code: warning.code,
                severity: warning.severity,
                context: warning.context,
            }))).toEqual([
                {code: "deprecated", severity: "warning", context: ["files", ".npmrc"]},
                {code: "deprecated", severity: "warning", context: ["files", ".npmrc", "postProcess"]},
                {code: "deprecated", severity: "warning", context: ["files", "jest.config.json"]},
                {code: "deprecated", severity: "warning", context: ["files", "tsconfig.json"]},
                {code: "deprecated", severity: "warning", context: ["files", "index.ts"]},
                {code: "deprecated", severity: "warning", context: ["files", "package.json"]},
                {code: "deprecated", severity: "warning", context: ["files", "package.json", "postProcess"]},
            ])
        })

        it("accepts all supported template syntaxes in legacy declarations", () => {
            const syntaxes = ["${}", "{{}}", ":", "<<>>"]

            for (const syntax of syntaxes) {
                const declaration = {
                    file: "./README.md",
                    template: syntax,
                } as any

                const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

                expect(valueOrThrow(result)).toBe(declaration)
                expect(warnings(result).map(warning => ({
                    code: warning.code,
                    severity: warning.severity,
                    context: warning.context,
                }))).toEqual([
                    {code: "deprecated", severity: "warning", context: []},
                ])
            }
        })

        it("rejects a declaration without files", () => {
            const declaration = {
                description: "No files",
            } as any

            const result = validateTemplateDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(error => ({
                kind: error.kind,
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    kind: "validation",
                    code: "required",
                    context: ["files"],
                    message: "files is required but was undefined",
                },
            ])
        })

        it("rejects files when it is not an object", () => {
            const declaration = {
                files: [],
            } as any

            const result = validateTemplateDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(error => ({
                kind: error.kind,
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    kind: "validation",
                    code: "wrong.type",
                    context: ["files"],
                    message: "files must be a NameAnd object, not an array",
                },
            ])
        })

        it("rejects invalid parent entries", () => {
            const declaration = {
                parent: [
                    {
                        src: 123,
                        delete: "index.js",
                    },
                ],
                files: {},
            } as any

            const result = validateTemplateDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(error => ({
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    code: "wrong.type",
                    context: ["parent", "0", "src"],
                    message: "parent.0.src must be a string but was a number",
                },
                {
                    code: "wrong.type",
                    context: ["parent", "0", "delete"],
                    message: "parent.0.delete must be an array",
                },
            ])
        })

        it("rejects invalid optional metadata fields", () => {
            const declaration = {
                defaultSrcPrefix: 1,
                description: false,
                documentation: {},
                repository: [],
                files: {},
            } as any

            const result = validateTemplateDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(error => ({
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    code: "wrong.type",
                    context: ["defaultSrcPrefix"],
                    message: "defaultSrcPrefix must be a string but was a number",
                },
                {
                    code: "wrong.type",
                    context: ["description"],
                    message: "description must be a string but was a boolean",
                },
                {
                    code: "wrong.type",
                    context: ["documentation"],
                    message: "documentation must be a string but was a object",
                },
                {
                    code: "wrong.type",
                    context: ["repository"],
                    message: "repository must be a string but was a object",
                },
            ])
        })
    })

    describe("validateTemplateFileDeclaration", () => {
        it("accepts a new copy declaration", () => {
            const declaration = {
                type: "copy",
                source: "./README.md",
                target: "README.md",
                overwrite: false,
                template: {
                    as: "${}",
                },
            } as any

            const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

            expect(valueOrThrow(result)).toBe(declaration)
            expect(warnings(result)).toEqual([])
        })

        it("accepts a new merge declaration", () => {
            const declaration = {
                type: "merge",
                source: ["./base.package.json", "./extra.package.json"],
                target: "package.json",
                fileType: "json",
                overwrite: true,
                template: {
                    as: "{{}}",
                },
            } as any

            const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

            expect(valueOrThrow(result)).toBe(declaration)
            expect(warnings(result)).toEqual([])
        })

        it("accepts a legacy declaration with a deprecation warning", () => {
            const declaration = {
                file: "./package.json",
                template: "${}",
                mergeWithParent: "json",
                sample: false,
            } as any

            const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

            expect(valueOrThrow(result)).toBe(declaration)
            expect(warnings(result).map(warning => ({
                code: warning.code,
                severity: warning.severity,
                context: warning.context,
            }))).toEqual([
                {code: "deprecated", severity: "warning", context: []},
            ])
        })

        it("rejects an illegal type discriminator", () => {
            const declaration = {
                type: "delete",
                source: "./README.md",
            } as any

            const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(error => ({
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    code: "illegal.type",
                    context: [],
                    message: "<root> has illegal type delete. Legal values are: copy, merge",
                },
            ])
        })

        it("rejects invalid copy fields", () => {
            const declaration = {
                type: "copy",
                source: ["not", "valid", "for", "copy"],
                target: 123,
                overwrite: "yes",
                template: {
                    as: "mustache",
                },
            } as any

            const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(error => ({
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    code: "wrong.type",
                    context: ["source"],
                    message: "source must be a string but was a object",
                },
                {
                    code: "wrong.type",
                    context: ["target"],
                    message: "target must be a string but was a number",
                },
                {
                    code: "wrong.type",
                    context: ["overwrite"],
                    message: "overwrite must be a boolean but was a string",
                },
                {
                    code: "wrong.literal",
                    context: ["template", "as"],
                    message: 'template.as must be one of "${}", "{{}}", ":", "<<>>" but was "mustache"',
                },
            ])
        })

        it("rejects invalid merge fields", () => {
            const declaration = {
                type: "merge",
                source: [1, 2],
                target: false,
                fileType: "xml",
                overwrite: "yes",
                template: {
                    as: "mustache",
                },
            } as any

            const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result).map(error => ({
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    code: "wrong.type",
                    context: ["source"],
                    message: "source must be a string or string[] but array item 0 was a number",
                },
                {
                    code: "wrong.type",
                    context: ["target"],
                    message: "target must be a string but was a boolean",
                },
                {
                    code: "wrong.literal",
                    context: ["fileType"],
                    message: 'fileType must be "json" but was "xml"',
                },
                {
                    code: "wrong.type",
                    context: ["overwrite"],
                    message: "overwrite must be a boolean but was a string",
                },
                {
                    code: "wrong.literal",
                    context: ["template", "as"],
                    message: 'template.as must be one of "${}", "{{}}", ":", "<<>>" but was "mustache"',
                },
            ])
        })

        it("rejects invalid legacy fields but still includes deprecation warnings", () => {
            const declaration = {
                file: 123,
                template: "mustache",
                mergeWithParent: "xml",
                postProcess: 999,
                sample: "yes",
            } as any

            const result = validateTemplateFileDeclaration(currentFile, declaration, observability)

            expect(isErrors(result)).toBe(true)

            expect(errorsOrThrow(result).map(error => ({
                code: error.code,
                context: error.context,
                message: error.message,
            }))).toEqual([
                {
                    code: "wrong.type",
                    context: ["file"],
                    message: "file must be a string but was a number",
                },
                {
                    code: "wrong.literal",
                    context: ["template"],
                    message: 'template must be one of "${}", "{{}}", ":", "<<>>" but was "mustache"',
                },
                {
                    code: "wrong.literal",
                    context: ["mergeWithParent"],
                    message: 'mergeWithParent must be "json" but was "xml"',
                },
                {
                    code: "wrong.type",
                    context: ["postProcess"],
                    message: "postProcess must be a string but was a number",
                },
                {
                    code: "wrong.type",
                    context: ["sample"],
                    message: "sample must be a boolean but was a string",
                },
            ])

            expect(warnings(result).map(warning => ({
                code: warning.code,
                severity: warning.severity,
                context: warning.context,
            }))).toEqual([
                {code: "deprecated", severity: "warning", context: []},
                {code: "deprecated", severity: "warning", context: ["postProcess"]},
            ])
        })
    })
})