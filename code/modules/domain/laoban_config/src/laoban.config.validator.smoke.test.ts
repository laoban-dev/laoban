import { isErrors } from "@laoban/errors"
import { nullObservability } from "@laoban/observability"
import {
    validateConfigFileContents,
    validateLaobanConfig,
} from "./laoban.config.validator"
import type { LaobanConfig } from "./laoban.config"

describe("laoban config validators", () => {
    const observability = nullObservability()

    describe("validateConfigFileContents", () => {
        it("accepts an empty object", () => {
            const input: unknown = {}

            const result = validateConfigFileContents([], observability)(input)

            expect(isErrors(result)).toBe(false)
            if (!isErrors(result)) {
                expect(result.value).toEqual({})
            }
        })

        it("accepts a numeric throttle when present", () => {
            const input: unknown = {
                throttle: 4,
            }

            const result = validateConfigFileContents([], observability)(input)

            expect(isErrors(result)).toBe(false)
            if (!isErrors(result)) {
                expect(result.value).toEqual({
                    throttle: 4,
                })
            }
        })

        it("rejects a non-numeric throttle when present", () => {
            const input: unknown = {
                throttle: "4",
            }

            const result = validateConfigFileContents([], observability)(input)

            expect(isErrors(result)).toBe(true)
        })

        it("fails when an optional field exists with the wrong type", () => {
            const input: unknown = {
                parents: [123],
            }

            const result = validateConfigFileContents([], observability)(input)

            expect(isErrors(result)).toBe(true)
        })

        it("accepts valid raw scripts", () => {
            const input: unknown = {
                scripts: {
                    build: {
                        description: "build the project",
                        commands: ["yarn build"],
                    },
                },
            }

            const result = validateConfigFileContents([], observability)(input)

            expect(isErrors(result)).toBe(false)
        })

        it("rejects invalid raw scripts", () => {
            const input: unknown = {
                scripts: {
                    build: {
                        description: "build the project",
                        commands: [123],
                    },
                },
            }

            const result = validateConfigFileContents([], observability)(input)

            expect(isErrors(result)).toBe(true)
        })
    })

    describe("validateLaobanConfig", () => {
        const validConfig = (overrides: Partial<LaobanConfig> = {}): LaobanConfig => ({
            packageManager: "yarn",
            versionFile: "version.txt",
            parents: ["./base.laoban.json"],
            properties: { react: "19.0.0" },
            templates: { typescript: "./templates/typescript" },
            defaultEnv: { NODE_ENV: "test" },
            scripts: {
                build: {
                    description: "build the project",
                    commands: [
                        {
                            command: "yarn build",
                            status: false,
                            executionScope: "eachPackage",
                        },
                    ],
                    inLinksOrder: false,
                    showShell: false,
                    commandArgs: {},
                    env: {},
                },
            },
            skipDirectories: [".git", "node_modules"],
            throttle: 4,
            ...overrides,
        })

        it("accepts a full valid config", () => {
            const input = validConfig()

            const result = validateLaobanConfig([], observability)(input)

            expect(isErrors(result)).toBe(false)
        })

        it("accepts throttle equal to 1", () => {
            const input = validConfig({
                throttle: 1,
            })

            const result = validateLaobanConfig([], observability)(input)

            expect(isErrors(result)).toBe(false)
        })

        it("fails when throttle is less than 1", () => {
            const input = validConfig({
                throttle: 0,
            })

            const result = validateLaobanConfig([], observability)(input)

            expect(isErrors(result)).toBe(true)
        })

        it("fails when throttle is missing from the final config", () => {
            const input: unknown = {
                packageManager: "yarn",
                versionFile: "version.txt",
                parents: [],
                properties: {},
                templates: {},
                defaultEnv: {},
                scripts: {},
                skipDirectories: [],
            }

            const result = validateLaobanConfig([], observability)(input as any)

            expect(isErrors(result)).toBe(true)
        })

        it("fails when a required field is missing", () => {
            const input: unknown = {
                versionFile: "version.txt",
                parents: [],
                properties: {},
                templates: {},
                defaultEnv: {},
                scripts: {},
                skipDirectories: [],
                throttle: 4,
            }

            const result = validateLaobanConfig([], observability)(input as any)

            expect(isErrors(result)).toBe(true)
        })

        it("fails when a normalised script is missing required normalised fields", () => {
            const input: unknown = {
                packageManager: "yarn",
                versionFile: "version.txt",
                parents: [],
                properties: {},
                templates: {},
                defaultEnv: {},
                scripts: {
                    build: {
                        description: "build the project",
                        commands: [
                            {
                                command: "yarn build",
                                status: false,
                            },
                        ],
                    },
                },
                skipDirectories: [],
                throttle: 4,
            }

            const result = validateLaobanConfig([], observability)(input as any)

            expect(isErrors(result)).toBe(true)
        })
    })
})
describe('from integration tests', () =>{
    const input = {
        "templacteDir"  : "${laobanDirectory}/template",
        "verscionFile"  : "${templateDir}/version.txt",
        "loag"          : ".log",
        "statsus"       : ".status",
        "profcile"      : ".profile",
        "packageManager": "yarn",
        "scripts"       : {
            "log" : {"notDescription": "displays the log file", "commands": ["cat ${log}"]},
            "link": {
                "description": "call '${packageManager} link' in each project directory",
                "commands"   : [
                    {"name": "tsc", "not": "tsc --noEmit false --outDir dist", "status": true},
                    {"name": "link", "notCmd": "cd dist && ${packageManager} link", "status": true}
                ]
            }
        }
    }

})