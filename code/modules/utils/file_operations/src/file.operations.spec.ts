import type {ICodec} from "@laoban/codec"
import {jsonCodec} from "@laoban/codec"
import {errors, errorsOrThrow, value, valueOrThrow} from "@laoban/errors"
import type {
    Filename,
    FileNameAndContent,
    FileOpIssue,
    FileOps,
    FileOpsHelperConfig,
    LoadTextConfig,
} from "@laoban/files"
import {recordingObservability} from "@laoban/observability"
import {dollarsBracesVarDefn, defaultTemplateEngine, type VariableDefn} from "@laoban/template"

import {
    copyFileDefinitionFn,
    defaultFileDefinitionFns,
    dictionaryFileContribution,
    type FileOpDefinition,
    type FileOperationConfig,
    isTemplatable,
    type MaybeTemplatable,
    mergeFileDefinitionFn,
    overwrite,
    renderIfTemplated,
    renderTarget,
} from "./file.operations"

type TestFileTypes = "text" | "json"
type TestMergeableFileTypes = "json"
type TestTemplateType = "${}"

function failingDecodeCodec(): ICodec<any> {
    return {
        encode: t => value(JSON.stringify(t)),
        decode: () => errors({
            kind: "decodeFailed",
            message: "decode failed",
        }),
    }
}

function failingEncodeCodec(): ICodec<any> {
    return {
        encode: () => errors({
            kind: "encodeFailed",
            message: "encode failed",
        }),
        decode: s => value(JSON.parse(s)),
    }
}

type TestFileOperationConfig =
    FileOperationConfig<TestFileTypes, TestMergeableFileTypes, TestTemplateType>

type ConfigFixture = Readonly<{
    config: TestFileOperationConfig
    loadText: jest.Mock
    fileExists: jest.Mock
}>

function makeConfig(args: {
    files?: Record<string, string>
    existingTargets?: Record<string, boolean>
    codecs?: Partial<Record<TestMergeableFileTypes, ICodec<any> | undefined>>
    loadTextWarnings?: FileOpIssue[]
    existsWarnings?: FileOpIssue[]
} = {}): ConfigFixture {
    const recording = recordingObservability()
    const files = args.files ?? {}
    const existingTargets = args.existingTargets ?? {}

    const loadText = jest.fn((source: string, _config?: LoadTextConfig) => {
        const text = files[source]

        return Promise.resolve(
            text === undefined
                ? errors<FileOpIssue>({
                    kind: "notFound",
                    message: `File not found: ${source}`,
                    context: {
                        operation: "loadText",
                        filename: source,
                    },
                    severity: "error",
                })
                : value<string, FileOpIssue>(text, args.loadTextWarnings),
        )
    })

    const fileExists = jest.fn((filename: string, _config?: FileOpsHelperConfig) =>
        Promise.resolve(value<boolean, FileOpIssue>(
            existingTargets[filename] ?? false,
            args.existsWarnings,
        )),
    )

    const fileOps = {
        loadText,
    } as unknown as Pick<FileOps, "loadText">

    const fileOpsHelperConfig: FileOpsHelperConfig = {
        infrastructure: {
            fileExists,
            listDirectory: jest.fn(),
            pathOps: {
                dirname: jest.fn(),
                resolvePath: jest.fn(),
                joinPath: jest.fn(),
            },
        },
    } as any

    return {
        loadText,
        fileExists,
        config: {
            observability: recording.observability,
            codecs: {
                json: jsonCodec(),
                ...(args.codecs ?? {}),
            } as Record<TestMergeableFileTypes, ICodec<any>>,
            fns: {} as any,
            templateEngine: defaultTemplateEngine,
            templateTypes: {
                "${}": dollarsBracesVarDefn as VariableDefn,
            },
            fileOps,
            loadTextConfig: {},
            fileOpsHelperConfig,
        },
    }
}

describe("file operations", () => {
    describe("overwrite", () => {
        it("defaults overwrite to true", () => {
            expect(overwrite({
                target: "package.json" as Filename,
            })).toBe(true)
        })

        it("uses explicit overwrite false", () => {
            expect(overwrite({
                target: "index.ts" as Filename,
                overwrite: false,
            })).toBe(false)
        })

        it("uses explicit overwrite true", () => {
            expect(overwrite({
                target: "index.ts" as Filename,
                overwrite: true,
            })).toBe(true)
        })
    })

    describe("isTemplatable", () => {
        it("returns false when no template is present", () => {
            const definition: FileOpDefinition<TestTemplateType> & MaybeTemplatable<TestTemplateType> = {
                target: "index.ts" as Filename,
            }

            expect(isTemplatable(definition)).toBe(false)
        })

        it("returns true when template is present", () => {
            const definition: FileOpDefinition<TestTemplateType> & MaybeTemplatable<TestTemplateType> = {
                target: "index.ts" as Filename,
                template: {as: "${}"},
            }

            expect(isTemplatable(definition)).toBe(true)
        })
    })

    describe("renderIfTemplated", () => {
        it("returns original text when the definition is not templatable", () => {
            const {config} = makeConfig()

            const result = renderIfTemplated(
                "hello ${name}",
                {
                    target: "index.ts" as Filename,
                },
                {name: "Phil"},
                config,
            )

            expect(valueOrThrow(result)).toBe("hello ${name}")
        })

        it("renders source content when the definition is templatable", () => {
            const {config} = makeConfig()

            const result = renderIfTemplated(
                "hello ${name}",
                {
                    target: "index.ts" as Filename,
                    template: {as: "${}"},
                },
                {name: "Phil"},
                config,
            )

            expect(valueOrThrow(result)).toBe("hello Phil")
        })

        it("returns an issue when the template type is unknown", () => {
            const {config} = makeConfig()

            const result = renderIfTemplated(
                "hello ${name}",
                {
                    target: "index.ts" as Filename,
                    template: {as: "unknown" as TestTemplateType},
                },
                {name: "Phil"},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "unknownTemplateType",
                    message: "Unknown template type: unknown",
                    context: {
                        target: "index.ts",
                        templateAs: "unknown",
                    },
                },
            ])
        })
    })

    describe("renderTarget", () => {
        it("always renders the target using ${}", () => {
            const {config} = makeConfig()

            const result = renderTarget(
                {
                    target: "src/${module}.ts" as Filename,
                },
                {module: "coolness"},
                config,
            )

            expect(valueOrThrow(result)).toBe("src/coolness.ts")
        })

        it("renders target even when the operation has no template block", () => {
            const {config} = makeConfig()

            const result = renderTarget(
                {
                    target: "generated/${name}/index.ts" as Filename,
                },
                {name: "thing"},
                config,
            )

            expect(valueOrThrow(result)).toBe("generated/thing/index.ts")
        })
    })

    describe("copyFileDefinitionFn", () => {
        it("loads source, copies text, renders target, and returns one file when target is missing", async () => {
            const {config, loadText, fileExists} = makeConfig({
                files: {
                    "template/index.ts": "export const x = 1\n",
                },
                existingTargets: {
                    "index.ts": false,
                },
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "index.ts" as Filename,
                },
                {},
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "index.ts" as Filename,
                    content: "export const x = 1\n",
                },
            ])

            expect(loadText).toHaveBeenCalledWith("template/index.ts", {})
            expect(fileExists).toHaveBeenCalledWith("index.ts", config.fileOpsHelperConfig)
        })

        it("renders copied content when templatable", async () => {
            const {config} = makeConfig({
                files: {
                    "template/index.ts": `export * from "./src/\${module}"\n`,
                },
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "src/${module}.ts" as Filename,
                    template: {as: "${}"},
                },
                {module: "coolness"},
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "src/coolness.ts" as Filename,
                    content: `export * from "./src/coolness"\n`,
                },
            ])
        })

        it("does not render copied content when no template block is present, but still renders target", async () => {
            const {config} = makeConfig({
                files: {
                    "template/index.ts": `export * from "./src/\${module}"\n`,
                },
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "src/${module}.ts" as Filename,
                },
                {module: "coolness"},
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "src/coolness.ts" as Filename,
                    content: `export * from "./src/\${module}"\n`,
                },
            ])
        })

        it("returns no file when target exists and overwrite is false", async () => {
            const {config} = makeConfig({
                files: {
                    "template/index.ts": "content\n",
                },
                existingTargets: {
                    "index.ts": true,
                },
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "index.ts" as Filename,
                    overwrite: false,
                },
                {},
                config,
            )

            expect(valueOrThrow(result)).toEqual([])
        })

        it("returns one file when target exists and overwrite is true", async () => {
            const {config} = makeConfig({
                files: {
                    "template/index.ts": "content\n",
                },
                existingTargets: {
                    "index.ts": true,
                },
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "index.ts" as Filename,
                    overwrite: true,
                },
                {},
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "index.ts" as Filename,
                    content: "content\n",
                },
            ])
        })

        it("defaults overwrite to true when target exists", async () => {
            const {config} = makeConfig({
                files: {
                    "template/index.ts": "content\n",
                },
                existingTargets: {
                    "index.ts": true,
                },
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "index.ts" as Filename,
                },
                {},
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "index.ts" as Filename,
                    content: "content\n",
                },
            ])
        })

        it("propagates warnings from fileExists", async () => {
            const warning: FileOpIssue = {
                kind: "unexpected",
                message: "warning from exists",
                context: {
                    operation: "fileExists",
                    filename: "index.ts",
                },
                severity: "warning",
            }

            const {config} = makeConfig({
                files: {
                    "template/index.ts": "content\n",
                },
                existsWarnings: [warning],
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "index.ts" as Filename,
                },
                {},
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "index.ts" as Filename,
                    content: "content\n",
                },
            ])
            expect(result.warnings).toEqual([warning])
        })

        it("propagates source load errors", async () => {
            const {config} = makeConfig({
                files: {},
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "missing.ts",
                    target: "index.ts" as Filename,
                },
                {},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "notFound",
                    message: "File not found: missing.ts",
                    context: {
                        operation: "loadText",
                        filename: "missing.ts",
                    },
                    severity: "error",
                },
            ])
        })

        it("propagates fileExists errors", async () => {
            const recording = recordingObservability()

            const loadText = jest.fn(() =>
                Promise.resolve(value<string, FileOpIssue>("content\n")),
            )

            const fileExists = jest.fn(() =>
                Promise.resolve(errors<FileOpIssue>({
                    kind: "io",
                    message: "could not check target",
                    context: {
                        operation: "fileExists",
                        filename: "index.ts",
                    },
                    severity: "error",
                })),
            )

            const config: TestFileOperationConfig = {
                observability: recording.observability,
                codecs: {
                    json: jsonCodec(),
                },
                fns: {} as any,
                templateEngine: defaultTemplateEngine,
                templateTypes: {
                    "${}": dollarsBracesVarDefn as VariableDefn,
                },
                fileOps: {
                    loadText,
                } as any,
                loadTextConfig: {},
                fileOpsHelperConfig: {
                    infrastructure: {
                        fileExists,
                        listDirectory: jest.fn(),
                        pathOps: {
                            dirname: jest.fn(),
                            resolvePath: jest.fn(),
                            joinPath: jest.fn(),
                        },
                    },
                } as any,
            }

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "index.ts" as Filename,
                },
                {},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "io",
                    message: "could not check target",
                    context: {
                        operation: "fileExists",
                        filename: "index.ts",
                    },
                    severity: "error",
                },
            ])
        })

        it("returns an issue when fileOpsHelperConfig.infrastructure is missing", async () => {
            const {config} = makeConfig({
                files: {
                    "template/index.ts": "content\n",
                },
            })

            const result = await copyFileDefinitionFn(
                {
                    type: "copy",
                    source: "template/index.ts",
                    target: "index.ts" as Filename,
                },
                {},
                {
                    ...config,
                    fileOpsHelperConfig: {},
                },
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "missingFileOpsHelperInfrastructure",
                    message: "File operation config has no FileOps helper infrastructure",
                    context: {
                        target: "index.ts",
                    },
                },
            ])
        })
    })

    describe("dictionaryFileContribution", () => {
        it("returns an empty object when dictionary has no files", () => {
            expect(dictionaryFileContribution("package.json" as Filename, {})).toEqual({})
        })

        it("returns an empty object when target has no contribution", () => {
            expect(dictionaryFileContribution("package.json" as Filename, {
                files: {
                    "tsconfig.json": {
                        compilerOptions: {
                            strict: true,
                        },
                    },
                },
            })).toEqual({})
        })

        it("returns the contribution for the rendered target", () => {
            expect(dictionaryFileContribution("package.json" as Filename, {
                files: {
                    "package.json": {
                        scripts: {
                            build: "tsc",
                        },
                    },
                },
            })).toEqual({
                scripts: {
                    build: "tsc",
                },
            })
        })

        it("uses the rendered target name as the contribution key", () => {
            expect(dictionaryFileContribution("src/coolness.ts" as Filename, {
                files: {
                    "src/${module}.ts": {
                        ignored: true,
                    },
                    "src/coolness.ts": {
                        used: true,
                    },
                },
            })).toEqual({
                used: true,
            })
        })
    })

    describe("mergeFileDefinitionFn", () => {
        it("loads one source, decodes with the real jsonCodec, merges dictionary contribution, and encodes", async () => {
            const {config, loadText, fileExists} = makeConfig({
                files: {
                    "template/package.json": JSON.stringify({
                        name: "@scope/module",
                        scripts: {
                            test: "jest",
                        },
                        dependencies: {
                            a: "1.0.0",
                        },
                    }),
                },
                existingTargets: {
                    "package.json": false,
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "package.json" as Filename,
                },
                {
                    files: {
                        "package.json": {
                            scripts: {
                                build: "tsc",
                            },
                            dependencies: {
                                b: "2.0.0",
                            },
                        },
                    },
                },
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "package.json" as Filename,
                    content: JSON.stringify({
                        name: "@scope/module",
                        scripts: {
                            test: "jest",
                            build: "tsc",
                        },
                        dependencies: {
                            a: "1.0.0",
                            b: "2.0.0",
                        },
                    }, null, 2) + "\n",
                },
            ])

            expect(loadText).toHaveBeenCalledWith("template/package.json", {})
            expect(fileExists).toHaveBeenCalledWith("package.json", config.fileOpsHelperConfig)
        })

        it("loads many sources and merges them in order before dictionary contribution", async () => {
            const {config} = makeConfig({
                files: {
                    "template/javascript.package.json": JSON.stringify({
                        scripts: {
                            test: "jest",
                        },
                        dependencies: {
                            a: "1.0.0",
                        },
                    }),
                    "template/typescript.package.json": JSON.stringify({
                        scripts: {
                            build: "tsc",
                        },
                        dependencies: {
                            b: "2.0.0",
                        },
                    }),
                    "template/react.typescript.package.json": JSON.stringify({
                        scripts: {
                            lint: "eslint",
                        },
                        dependencies: {
                            a: "override",
                        },
                    }),
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: [
                        "template/javascript.package.json",
                        "template/typescript.package.json",
                        "template/react.typescript.package.json",
                    ],
                    target: "package.json" as Filename,
                },
                {
                    files: {
                        "package.json": {
                            scripts: {
                                local: "node local.js",
                            },
                            dependencies: {
                                c: "3.0.0",
                            },
                        },
                    },
                },
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "package.json" as Filename,
                    content: JSON.stringify({
                        scripts: {
                            test: "jest",
                            build: "tsc",
                            lint: "eslint",
                            local: "node local.js",
                        },
                        dependencies: {
                            a: "override",
                            b: "2.0.0",
                            c: "3.0.0",
                        },
                    }, null, 2) + "\n",
                },
            ])
        })

        it("renders source JSON before decoding when templatable", async () => {
            const {config} = makeConfig({
                files: {
                    "template/package.json": JSON.stringify({
                        name: "${packageName}",
                        version: "${version}",
                    }),
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "package.json" as Filename,
                    template: {as: "${}"},
                },
                {
                    packageName: "@scope/coolness",
                    version: "1.2.3",
                    files: {},
                },
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "package.json" as Filename,
                    content: JSON.stringify({
                        name: "@scope/coolness",
                        version: "1.2.3",
                    }, null, 2) + "\n",
                },
            ])
        })

        it("renders target before looking up dictionary contribution", async () => {
            const {config} = makeConfig({
                files: {
                    "template/package.json": JSON.stringify({
                        name: "@scope/coolness",
                    }),
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "${target}" as Filename,
                },
                {
                    target: "package.json",
                    files: {
                        "package.json": {
                            scripts: {
                                build: "tsc",
                            },
                        },
                        "${target}": {
                            ignored: true,
                        },
                    },
                },
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "package.json" as Filename,
                    content: JSON.stringify({
                        name: "@scope/coolness",
                        scripts: {
                            build: "tsc",
                        },
                    }, null, 2) + "\n",
                },
            ])
        })

        it("returns no file when rendered target exists and overwrite is false", async () => {
            const {config} = makeConfig({
                files: {
                    "template/package.json": "{}",
                },
                existingTargets: {
                    "package.json": true,
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "${target}" as Filename,
                    overwrite: false,
                },
                {
                    target: "package.json",
                    files: {
                        "package.json": {
                            scripts: {
                                build: "tsc",
                            },
                        },
                    },
                },
                config,
            )

            expect(valueOrThrow(result)).toEqual([])
        })

        it("returns missingCodec when no codec is configured for file type", async () => {
            const {config} = makeConfig({
                files: {
                    "template/package.json": "{}",
                },
                codecs: {
                    json: undefined,
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "package.json" as Filename,
                },
                {},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "missingCodec",
                    message: "No codec configured for file type json",
                    context: {
                        type: "merge",
                        fileType: "json",
                        target: "package.json",
                    },
                },
            ])
        })

        it("returns real jsonCodec decode errors for invalid JSON", async () => {
            const {config} = makeConfig({
                files: {
                    "template/package.json": "not json",
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "package.json" as Filename,
                },
                {},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "jsonCodecDecode",
                    message: expect.stringContaining("Could not parse JSON:"),
                },
            ])
        })

        it("propagates codec decode errors from a configured codec", async () => {
            const {config} = makeConfig({
                files: {
                    "template/package.json": "not json",
                },
                codecs: {
                    json: failingDecodeCodec(),
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "package.json" as Filename,
                },
                {},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "decodeFailed",
                    message: "decode failed",
                },
            ])
        })

        it("propagates codec encode errors", async () => {
            const {config} = makeConfig({
                files: {
                    "template/package.json": "{}",
                },
                codecs: {
                    json: failingEncodeCodec(),
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: "template/package.json",
                    target: "package.json" as Filename,
                },
                {},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "encodeFailed",
                    message: "encode failed",
                },
            ])
        })

        it("accumulates load errors from many sources", async () => {
            const {config} = makeConfig({
                files: {
                    "template/one.json": "{}",
                },
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: [
                        "template/missing-a.json",
                        "template/one.json",
                        "template/missing-b.json",
                    ],
                    target: "package.json" as Filename,
                },
                {},
                config,
            )

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "notFound",
                    message: "File not found: template/missing-a.json",
                    context: {
                        operation: "loadText",
                        filename: "template/missing-a.json",
                    },
                    severity: "error",
                },
                {
                    kind: "notFound",
                    message: "File not found: template/missing-b.json",
                    context: {
                        operation: "loadText",
                        filename: "template/missing-b.json",
                    },
                    severity: "error",
                },
            ])
        })

        it("propagates warnings from loading multiple sources", async () => {
            const warning: FileOpIssue = {
                kind: "unexpected",
                message: "warning from load",
                context: {
                    operation: "loadText",
                    filename: "template/source.json",
                },
                severity: "warning",
            }

            const {config} = makeConfig({
                files: {
                    "template/one.json": "{}",
                    "template/two.json": "{}",
                },
                loadTextWarnings: [warning],
            })

            const result = await mergeFileDefinitionFn(
                {
                    type: "merge",
                    fileType: "json",
                    source: ["template/one.json", "template/two.json"],
                    target: "package.json" as Filename,
                },
                {},
                config,
            )

            expect(valueOrThrow(result)).toEqual<FileNameAndContent[]>([
                {
                    filename: "package.json" as Filename,
                    content: "{}\n",
                },
            ])
            expect(result.warnings).toEqual([warning, warning])
        })
    })

    describe("defaultFileDefinitionFns", () => {
        it("returns copy and merge functions", () => {
            const fns = defaultFileDefinitionFns()

            expect(Object.keys(fns).sort()).toEqual(["copy", "merge"])
            expect(typeof fns.copy).toBe("function")
            expect(typeof fns.merge).toBe("function")
        })
    })
})