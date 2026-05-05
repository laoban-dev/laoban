import {
    defaultSource,
    isNewTemplateFileDeclaration,
    legacyOverwrite,
    legacyTemplateSyntax,
    normaliseLegacyCopyTemplateFileDeclaration,
    normaliseLegacyMergeTemplateFileDeclaration,
    normaliseLegacyTemplateFileDeclaration,
    normaliseLoadedTemplateDeclaration,
    normaliseNewCopyTemplateFileDeclaration,
    normaliseNewMergeTemplateFileDeclaration,
    normaliseNewTemplateFileDeclaration,
    normaliseTemplateDeclaration,
    normaliseTemplateFileDeclaration,
    trimTrailingSlash,
} from "./template.for.files.normalise"

describe("template file normalisation", () => {
    describe("normaliseTemplateDeclaration", () => {
        it("normalises a mixed template declaration", () => {
            const declaration = {
                defaultSrcPrefix: "@laoban@/templates/typescript",
                description: "Typescript template",
                documentation: "Docs",
                repository: "Repo",
                files: {
                    "README.md": {
                        type: "copy",
                        source: "./README.template.md",
                        target: "README.md",
                        overwrite: true,
                        template: {
                            as: "{{}}",
                        },
                    },
                    "package.json": {
                        type: "merge",
                        source: ["./base.package.json", "./extra.package.json"],
                        fileType: "json",
                    },
                    "index.ts": {
                        sample: true,
                    },
                    "tsconfig.json": {
                        file: "./tsconfig.json",
                    },
                    "legacy-package.json": {
                        file: "./legacy.package.json",
                        template: "${}",
                        mergeWithParent: "json",
                    },
                },
            } as any

            expect(normaliseTemplateDeclaration(
                "typescript",
                "@laoban@/templates/typescript/template.json",
                declaration,
            )).toEqual({
                name: "typescript",
                source: "@laoban@/templates/typescript/template.json",
                files: {
                    "README.md": {
                        type: "copy",
                        target: "README.md",
                        source: "./README.template.md",
                        overwrite: true,
                        template: {
                            as: "{{}}",
                        },
                        deprecated: false,
                    },
                    "package.json": {
                        type: "merge",
                        target: "package.json",
                        source: ["./base.package.json", "./extra.package.json"],
                        fileType: "json",
                        deprecated: false,
                    },
                    "index.ts": {
                        type: "copy",
                        target: "index.ts",
                        source: "@laoban@/templates/typescript/index.ts",
                        overwrite: false,
                        deprecated: true,
                    },
                    "tsconfig.json": {
                        type: "copy",
                        target: "tsconfig.json",
                        source: "./tsconfig.json",
                        deprecated: true,
                    },
                    "legacy-package.json": {
                        type: "merge",
                        target: "legacy-package.json",
                        source: "./legacy.package.json",
                        fileType: "json",
                        template: {
                            as: "${}",
                        },
                        deprecated: true,
                    },
                },
            })
        })

        it("normalises a loaded template declaration", () => {
            const loaded = {
                name: "typescript",
                source: "@laoban@/templates/typescript/template.json",
                declaration: {
                    files: {
                        "README.md": {
                            type: "copy",
                            source: "./README.md",
                        },
                    },
                },
            } as any

            expect(normaliseLoadedTemplateDeclaration(loaded)).toEqual({
                name: "typescript",
                source: "@laoban@/templates/typescript/template.json",
                files: {
                    "README.md": {
                        type: "copy",
                        target: "README.md",
                        source: "./README.md",
                        deprecated: false,
                    },
                },
            })
        })
    })

    describe("normaliseTemplateFileDeclaration", () => {
        it("normalises new copy declarations", () => {
            expect(normaliseTemplateFileDeclaration(
                "README.md",
                {
                    type: "copy",
                    source: "./README.template.md",
                    target: "docs/README.md",
                    overwrite: false,
                    template: {
                        as: "<<>>",
                    },
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "docs/README.md",
                source: "./README.template.md",
                overwrite: false,
                template: {
                    as: "<<>>",
                },
                deprecated: false,
            })
        })

        it("normalises new merge declarations", () => {
            expect(normaliseTemplateFileDeclaration(
                "package.json",
                {
                    type: "merge",
                    source: "./package.json",
                    target: "generated/package.json",
                    fileType: "json",
                    overwrite: true,
                    template: {
                        as: ":",
                    },
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "merge",
                target: "generated/package.json",
                source: "./package.json",
                fileType: "json",
                overwrite: true,
                template: {
                    as: ":",
                },
                deprecated: false,
            })
        })

        it("normalises legacy copy declarations", () => {
            expect(normaliseTemplateFileDeclaration(
                "index.ts",
                {
                    sample: true,
                    template: "${}",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "index.ts",
                source: "@laoban@/templates/typescript/index.ts",
                overwrite: false,
                template: {
                    as: "${}",
                },
                deprecated: true,
            })
        })

        it("normalises legacy merge declarations", () => {
            expect(normaliseTemplateFileDeclaration(
                "package.json",
                {
                    file: "./package.json",
                    template: "{{}}",
                    mergeWithParent: "json",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "merge",
                target: "package.json",
                source: "./package.json",
                fileType: "json",
                template: {
                    as: "{{}}",
                },
                deprecated: true,
            })
        })
    })

    describe("new declarations", () => {
        it("defaults new copy target and source", () => {
            expect(normaliseNewCopyTemplateFileDeclaration(
                "README.md",
                {
                    type: "copy",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "README.md",
                source: "@laoban@/templates/typescript/README.md",
                deprecated: false,
            })
        })

        it("defaults new merge target and source", () => {
            expect(normaliseNewMergeTemplateFileDeclaration(
                "package.json",
                {
                    type: "merge",
                    fileType: "json",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "merge",
                target: "package.json",
                source: "@laoban@/templates/typescript/package.json",
                fileType: "json",
                deprecated: false,
            })
        })

        it("dispatches new copy declarations", () => {
            expect(normaliseNewTemplateFileDeclaration(
                "README.md",
                {
                    type: "copy",
                    source: "./README.md",
                } as any,
            )).toEqual({
                type: "copy",
                target: "README.md",
                source: "./README.md",
                deprecated: false,
            })
        })

        it("dispatches new merge declarations", () => {
            expect(normaliseNewTemplateFileDeclaration(
                "package.json",
                {
                    type: "merge",
                    source: "./package.json",
                    fileType: "json",
                } as any,
            )).toEqual({
                type: "merge",
                target: "package.json",
                source: "./package.json",
                fileType: "json",
                deprecated: false,
            })
        })
    })

    describe("legacy declarations", () => {
        it("normalises legacy copy with explicit file", () => {
            expect(normaliseLegacyCopyTemplateFileDeclaration(
                "tsconfig.json",
                {
                    file: "./tsconfig.json",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "tsconfig.json",
                source: "./tsconfig.json",
                deprecated: true,
            })
        })

        it("normalises legacy copy with default source", () => {
            expect(normaliseLegacyCopyTemplateFileDeclaration(
                "index.ts",
                {},
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "index.ts",
                source: "@laoban@/templates/typescript/index.ts",
                deprecated: true,
            })
        })

        it("normalises legacy copy sample as overwrite false", () => {
            expect(normaliseLegacyCopyTemplateFileDeclaration(
                "index.ts",
                {
                    sample: true,
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "index.ts",
                source: "@laoban@/templates/typescript/index.ts",
                overwrite: false,
                deprecated: true,
            })
        })

        it("normalises legacy copy template syntax", () => {
            expect(normaliseLegacyCopyTemplateFileDeclaration(
                "README.md",
                {
                    template: "<<>>",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "README.md",
                source: "@laoban@/templates/typescript/README.md",
                template: {
                    as: "<<>>",
                },
                deprecated: true,
            })
        })

        it("normalises legacy merge with explicit file", () => {
            expect(normaliseLegacyMergeTemplateFileDeclaration(
                "package.json",
                {
                    file: "./package.json",
                    mergeWithParent: "json",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "merge",
                target: "package.json",
                source: "./package.json",
                fileType: "json",
                deprecated: true,
            })
        })

        it("normalises legacy merge with default source", () => {
            expect(normaliseLegacyMergeTemplateFileDeclaration(
                "package.json",
                {
                    mergeWithParent: "json",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "merge",
                target: "package.json",
                source: "@laoban@/templates/typescript/package.json",
                fileType: "json",
                deprecated: true,
            })
        })

        it("normalises legacy merge sample and template syntax", () => {
            expect(normaliseLegacyMergeTemplateFileDeclaration(
                "package.json",
                {
                    mergeWithParent: "json",
                    sample: true,
                    template: ":",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "merge",
                target: "package.json",
                source: "@laoban@/templates/typescript/package.json",
                fileType: "json",
                overwrite: false,
                template: {
                    as: ":",
                },
                deprecated: true,
            })
        })

        it("dispatches legacy copy declarations", () => {
            expect(normaliseLegacyTemplateFileDeclaration(
                "README.md",
                {},
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: "README.md",
                source: "@laoban@/templates/typescript/README.md",
                deprecated: true,
            })
        })

        it("dispatches legacy merge declarations", () => {
            expect(normaliseLegacyTemplateFileDeclaration(
                "package.json",
                {
                    mergeWithParent: "json",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "merge",
                target: "package.json",
                source: "@laoban@/templates/typescript/package.json",
                fileType: "json",
                deprecated: true,
            })
        })

        it("does not carry legacy postProcess into normalised operations", () => {
            expect(normaliseLegacyTemplateFileDeclaration(
                ".npmrc",
                {
                    postProcess: "checkEnv(NPM_TOKEN)",
                } as any,
                "@laoban@/templates/typescript",
            )).toEqual({
                type: "copy",
                target: ".npmrc",
                source: "@laoban@/templates/typescript/.npmrc",
                deprecated: true,
            })
        })
    })

    describe("helpers", () => {
        it("identifies new declarations", () => {
            expect(isNewTemplateFileDeclaration({
                type: "copy",
            } as any)).toBe(true)

            expect(isNewTemplateFileDeclaration({
                type: "merge",
            } as any)).toBe(true)

            expect(isNewTemplateFileDeclaration({
                file: "./README.md",
            } as any)).toBe(false)

            expect(isNewTemplateFileDeclaration({} as any)).toBe(false)
        })

        it("calculates default source from prefix", () => {
            expect(defaultSource(
                "@laoban@/templates/typescript",
                "README.md",
            )).toBe("@laoban@/templates/typescript/README.md")
        })

        it("calculates default source from prefix with trailing slash", () => {
            expect(defaultSource(
                "@laoban@/templates/typescript/",
                "README.md",
            )).toBe("@laoban@/templates/typescript/README.md")
        })

        it("calculates default source without prefix", () => {
            expect(defaultSource(
                undefined,
                "README.md",
            )).toBe("./README.md")
        })

        it("calculates default source with empty prefix", () => {
            expect(defaultSource(
                "",
                "README.md",
            )).toBe("./README.md")
        })

        it("converts legacy sample true to overwrite false", () => {
            expect(legacyOverwrite({
                sample: true,
            } as any)).toBe(false)
        })

        it("leaves legacy sample false as undefined", () => {
            expect(legacyOverwrite({
                sample: false,
            } as any)).toBeUndefined()
        })

        it("leaves absent legacy sample as undefined", () => {
            expect(legacyOverwrite({})).toBeUndefined()
        })

        it("converts legacy template syntax", () => {
            expect(legacyTemplateSyntax("${}")).toEqual({
                as: "${}",
            })
        })

        it("leaves absent legacy template syntax as undefined", () => {
            expect(legacyTemplateSyntax(undefined)).toBeUndefined()
        })

        it("trims one trailing slash", () => {
            expect(trimTrailingSlash("a/b/")).toBe("a/b")
        })

        it("leaves values without trailing slash unchanged", () => {
            expect(trimTrailingSlash("a/b")).toBe("a/b")
        })
    })
})