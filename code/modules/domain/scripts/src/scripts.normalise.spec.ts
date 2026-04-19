import {
    normaliseRawLaobanCommand,
    normaliseRawLaobanScript,
    normaliseRawLaobanScripts,
} from "./scripts.normalise";
import {
    LaobanCommand,
    LaobanScript,
    RawLaobanScript,
} from "./scripts.domain";

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
            guard: "${packageDetails.guards.test}",
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