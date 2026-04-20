import {
    normaliseRawLaobanCommand,
    normaliseRawLaobanScript,
    normaliseRawLaobanScripts,
    normaliseRawScriptGuard,
} from "./scripts.normalise";
import {
    type LaobanCommand,
    type LaobanScript,
    type RawLaobanScript,
} from "./scripts.domain";

describe("normaliseRawScriptGuard", () => {
    it("returns undefined when guard is undefined", () => {
        expect(normaliseRawScriptGuard(undefined)).toBeUndefined();
    });

    it("normalises a boolean guard to an object guard", () => {
        expect(normaliseRawScriptGuard(true)).toEqual({
            value: true,
        });
    });

    it("normalises a string guard to an object guard", () => {
        expect(normaliseRawScriptGuard("${packageDetails.guards.test}")).toEqual({
            value: "${packageDetails.guards.test}",
        });
    });

    it("preserves an object guard", () => {
        expect(
            normaliseRawScriptGuard({
                value: "${packageDetails.guards.test}",
                default: true,
            })
        ).toEqual({
            value: "${packageDetails.guards.test}",
            default: true,
        });
    });
});

describe("normaliseRawLaobanCommand", () => {
    it("normalises a string command to an object command with default status", () => {
        expect(normaliseRawLaobanCommand("js:process.cwd()")).toEqual({
            command: "js:process.cwd()",
            status: false,
        });
    });

    it("normalises an object command and defaults missing status", () => {
        expect(
            normaliseRawLaobanCommand({
                command: "yarn test",
                directory: "dist",
            })
        ).toEqual({
            command: "yarn test",
            directory: "dist",
            status: false,
        });
    });

    it("normalises a string guard on an object command", () => {
        expect(
            normaliseRawLaobanCommand({
                command: "yarn test",
                guard: "${packageDetails.guards.test}",
            })
        ).toEqual({
            command: "yarn test",
            guard: {
                value: "${packageDetails.guards.test}",
            },
            status: false,
        });
    });

    it("normalises an object guard on an object command", () => {
        expect(
            normaliseRawLaobanCommand({
                command: "yarn test",
                guard: {
                    value: "${packageDetails.guards.test}",
                    default: true,
                },
            })
        ).toEqual({
            command: "yarn test",
            guard: {
                value: "${packageDetails.guards.test}",
                default: true,
            },
            status: false,
        });
    });

    it("preserves explicit object command fields", () => {
        expect(
            normaliseRawLaobanCommand({
                name: "test",
                command: "yarn test",
                guard: "${packageDetails.guards.test}",
                directory: "dist",
                status: true,
            })
        ).toEqual({
            name: "test",
            command: "yarn test",
            guard: {
                value: "${packageDetails.guards.test}",
            },
            directory: "dist",
            status: true,
        });
    });
});

describe("normaliseRawLaobanScript", () => {
    it("defaults missing script fields", () => {
        const input: RawLaobanScript = {
            description: "test script",
            commands: ["js:process.cwd()"],
        };

        const expected: LaobanScript = {
            description: "test script",
            commands: [
                {
                    command: "js:process.cwd()",
                    status: false,
                },
            ],
            inLinksOrder: false,
            showShell: false,
            commandArgs: {},
            env: {},
        };

        expect(normaliseRawLaobanScript(input)).toEqual(expected);
    });

    it("normalises a string script guard", () => {
        const input: RawLaobanScript = {
            description: "Calls mvn with the arguments",
            guard: "${packageDetails.guards.mvn}",
            commands: ["mvn ${passThruArgs}"],
        };

        expect(normaliseRawLaobanScript(input)).toEqual({
            description: "Calls mvn with the arguments",
            guard: {
                value: "${packageDetails.guards.mvn}",
            },
            commands: [
                {
                    command: "mvn ${passThruArgs}",
                    status: false,
                },
            ],
            inLinksOrder: false,
            showShell: false,
            commandArgs: {},
            env: {},
        });
    });

    it("normalises an object script guard", () => {
        const input: RawLaobanScript = {
            description: "runs tests",
            guard: {
                value: "${packageDetails.guards.test}",
                default: true,
            },
            commands: [
                {
                    name: "test",
                    command: "${packageManager} test",
                    status: true,
                },
            ],
        };

        expect(normaliseRawLaobanScript(input)).toEqual({
            description: "runs tests",
            guard: {
                value: "${packageDetails.guards.test}",
                default: true,
            },
            commands: [
                {
                    name: "test",
                    command: "${packageManager} test",
                    status: true,
                },
            ],
            inLinksOrder: false,
            showShell: false,
            commandArgs: {},
            env: {},
        });
    });

    it("preserves provided script fields", () => {
        const input: RawLaobanScript = {
            description: "Calls mvn with the arguments",
            guard: "${packageDetails.guards.mvn}",
            osGuard: "Windows_NT",
            inLinksOrder: true,
            showShell: true,
            commandArgs: {
                passThruArgs: "the arguments that are passed through to maven",
            },
            env: {
                PORT: "${packageDetails.guards.packport}",
            },
            commands: [
                {
                    name: "mvn",
                    command: "mvn ${passThruArgs}",
                    guard: "${packageDetails.guards.mvn}",
                    directory: "dist",
                    status: true,
                },
            ],
        };

        const expected: LaobanScript = {
            description: "Calls mvn with the arguments",
            guard: {
                value: "${packageDetails.guards.mvn}",
            },
            osGuard: "Windows_NT",
            inLinksOrder: true,
            showShell: true,
            commandArgs: {
                passThruArgs: "the arguments that are passed through to maven",
            },
            env: {
                PORT: "${packageDetails.guards.packport}",
            },
            commands: [
                {
                    name: "mvn",
                    command: "mvn ${passThruArgs}",
                    guard: {
                        value: "${packageDetails.guards.mvn}",
                    },
                    directory: "dist",
                    status: true,
                },
            ],
        };

        expect(normaliseRawLaobanScript(input)).toEqual(expected);
    });

    it("normalises mixed string and object commands", () => {
        const input: RawLaobanScript = {
            description: "mixed commands",
            commands: [
                "js:process.cwd()",
                {
                    command: "yarn test",
                },
            ],
        };

        expect(normaliseRawLaobanScript(input)).toEqual({
            description: "mixed commands",
            commands: [
                {
                    command: "js:process.cwd()",
                    status: false,
                },
                {
                    command: "yarn test",
                    status: false,
                },
            ],
            inLinksOrder: false,
            showShell: false,
            commandArgs: {},
            env: {},
        });
    });
});

describe("normaliseRawLaobanScripts", () => {
    it("normalises a map of scripts", () => {
        const result = normaliseRawLaobanScripts({
            test: {
                description: "runs tests",
                guard: {
                    value: "${packageDetails.guards.test}",
                    default: true,
                },
                commands: ["yarn test"],
            },
            lsDist: {
                description: "lists dist",
                commands: [
                    {
                        command: "js:process.cwd()",
                        directory: "dist",
                    },
                ],
            },
        });

        expect(result).toEqual({
            test: {
                description: "runs tests",
                guard: {
                    value: "${packageDetails.guards.test}",
                    default: true,
                },
                commands: [
                    {
                        command: "yarn test",
                        status: false,
                    },
                ],
                inLinksOrder: false,
                showShell: false,
                commandArgs: {},
                env: {},
            },
            lsDist: {
                description: "lists dist",
                commands: [
                    {
                        command: "js:process.cwd()",
                        directory: "dist",
                        status: false,
                    },
                ],
                inLinksOrder: false,
                showShell: false,
                commandArgs: {},
                env: {},
            },
        });
    });

    it("returns an empty object when given no scripts", () => {
        expect(normaliseRawLaobanScripts({})).toEqual({});
    });
});