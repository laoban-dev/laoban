import {isErrors} from "@laoban/errors";
import {nullObservability} from "@laoban/observability";
import {validateConfigFileContents, validateLaobanConfig,} from "./laoban.config.validator";
import type {LaobanConfig} from "./laoban.config";

describe("laoban config validators", () => {
    const observability = nullObservability();

    describe("validateConfigFileContents", () => {
        it("accepts an empty object", () => {
            const input: unknown = {};

            const result = validateConfigFileContents([], observability)(input);

            expect(isErrors(result)).toBe(false);
            if (!isErrors(result)) {
                expect(result.value).toEqual({});
            }
        });

        it("fails when an optional field exists with the wrong type", () => {
            const input: unknown = {
                parents: [123],
            };

            const result = validateConfigFileContents([], observability)(input);

            expect(isErrors(result)).toBe(true);
        });

        it("accepts valid raw scripts", () => {
            const input: unknown = {
                scripts: {
                    build: {
                        description: "build the project",
                        commands: ["yarn build"],
                    },
                },
            };

            const result = validateConfigFileContents([], observability)(input);

            expect(isErrors(result)).toBe(false);
        });

        it("rejects invalid raw scripts", () => {
            const input: unknown = {
                scripts: {
                    build: {
                        description: "build the project",
                        commands: [123],
                    },
                },
            };

            const result = validateConfigFileContents([], observability)(input);

            expect(isErrors(result)).toBe(true);
        });
    });

    describe("validateLaobanConfig", () => {
        it("accepts a full valid config", () => {
            const input: LaobanConfig = {
                packageManager: "yarn",
                versionFile: "version.txt",
                parents: ["./base.laoban.json"],
                properties: {react: "19.0.0"},
                templates: {typescript: "./templates/typescript"},
                defaultEnv: {NODE_ENV: "test"},
                scripts: {
                    build: {
                        description: "build the project",
                        commands: [
                            {
                                command: "yarn build",
                                status: false,
                                executionScope: 'eachPackage'
                            },
                        ],
                        inLinksOrder: false,
                        showShell: false,
                        commandArgs: {},
                        env: {},
                    },
                },
                skipDirectories: [".git", "node_modules"],
            };

            const result = validateLaobanConfig([], observability)(input);

            expect(isErrors(result)).toBe(false);
        });

        it("fails when a required field is missing", () => {
            const input: unknown = {
                versionFile: "version.txt",
                parents: [],
                properties: {},
                templates: {},
                defaultEnv: {},
                scripts: {},
                skipDirectories: [],
            };

            const result = validateLaobanConfig([], observability)(input as any);

            expect(isErrors(result)).toBe(true);
        });

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
            };

            const result = validateLaobanConfig([], observability)(input as any);

            expect(isErrors(result)).toBe(true);
        });
    });
});