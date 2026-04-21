import {
    errorsOrThrow,
    valueOrThrow,
} from "@laoban/errors";
import {recordingObservability} from "@laoban/observability";
import type {ValidationContext} from "@laoban/validation";
import {
    validateCommandArgs,
    validateEnv,
    validateLaobanCommand,
    validateLaobanScript,
    validateRawLaobanCommand,
    validateRawLaobanCommandObject,
    validateRawLaobanScript,
    validateRawScriptGuard,
    validateRawScriptGuardObject,
    validateScriptGuard,
} from "./scripts.validator";
import {
    type LaobanCommand,
    type LaobanScript,
    type RawLaobanCommandObject,
    type RawLaobanScript,
    type RawScriptGuardObject,
    type ScriptGuard,
} from "./scripts.domain";

const {observability: testObservability} =
    recordingObservability();

const ctx = (...parts: string[]): ValidationContext => parts;

describe("validateRawScriptGuardObject", () => {
    it("accepts a raw guard object with value only", () => {
        const input: RawScriptGuardObject = {
            value: "${packageDetails.guards.test}",
        };

        const result = validateRawScriptGuardObject(ctx("guard"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("accepts a raw guard object with default", () => {
        const input: RawScriptGuardObject = {
            value: "${packageDetails.guards.test}",
            default: true,
        };

        const result = validateRawScriptGuardObject(ctx("guard"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a raw guard object without value", () => {
        const result = validateRawScriptGuardObject(ctx("guard"), testObservability)({
            default: true,
        } as any);

        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a raw guard object with non-boolean default", () => {
        const result = validateRawScriptGuardObject(ctx("guard"), testObservability)({
            value: "${packageDetails.guards.test}",
            default: "yes",
        } as any);

        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateRawScriptGuard", () => {
    it("accepts a boolean raw guard", () => {
        const result = validateRawScriptGuard(ctx("guard"), testObservability)(true);
        expect(valueOrThrow(result)).toBe(true);
    });

    it("accepts a string raw guard", () => {
        const result = validateRawScriptGuard(ctx("guard"), testObservability)(
            "${packageDetails.guards.test}"
        );
        expect(valueOrThrow(result)).toBe("${packageDetails.guards.test}");
    });

    it("accepts an object raw guard", () => {
        const input = {
            value: "${packageDetails.guards.test}",
            default: true,
        };

        const result = validateRawScriptGuard(ctx("guard"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a number raw guard", () => {
        const result = validateRawScriptGuard(ctx("guard"), testObservability)(42 as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateScriptGuard", () => {
    it("accepts a normalized guard with string value", () => {
        const input: ScriptGuard = {
            value: "${packageDetails.guards.test}",
        };

        const result = validateScriptGuard(ctx("guard"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("accepts a normalized guard with boolean value", () => {
        const input: ScriptGuard = {
            value: true,
            default: false,
        };

        const result = validateScriptGuard(ctx("guard"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a primitive normalized guard", () => {
        const result = validateScriptGuard(ctx("guard"), testObservability)(true as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a normalized guard without value", () => {
        const result = validateScriptGuard(ctx("guard"), testObservability)({
            default: true,
        } as any);

        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateCommandArgs", () => {
    it("accepts undefined", () => {
        const result = validateCommandArgs(ctx("commandArgs"), testObservability)(undefined);
        expect(valueOrThrow(result)).toBeUndefined();
    });

    it("accepts a string-to-string record", () => {
        const input = {
            passThruArgs: "the arguments that are passed through to maven",
            profile: "the spring profile to use",
        };
        const result = validateCommandArgs(ctx("commandArgs"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a record with non-string values", () => {
        const result = validateCommandArgs(ctx("commandArgs"), testObservability)({
            passThruArgs: 123,
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects an array", () => {
        const result = validateCommandArgs(ctx("commandArgs"), testObservability)([] as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateEnv", () => {
    it("accepts undefined", () => {
        const result = validateEnv(ctx("env"), testObservability)(undefined);
        expect(valueOrThrow(result)).toBeUndefined();
    });

    it("accepts a string-to-string record", () => {
        const input = {
            PORT: "8080",
            NODE_ENV: "development",
        };
        const result = validateEnv(ctx("env"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a record with non-string values", () => {
        const result = validateEnv(ctx("env"), testObservability)({
            PORT: 8080,
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateRawLaobanCommandObject", () => {
    const validCommand: RawLaobanCommandObject = {
        name: "test",
        command: "yarn test",
        guard: "${packageDetails.guards.test}",
        directory: "dist",
        status: true,
    };

    it("accepts a valid raw command object", () => {
        const result = validateRawLaobanCommandObject(ctx("command"), testObservability)(validCommand);
        expect(valueOrThrow(result)).toEqual(validCommand);
    });

    it("accepts a minimal raw command object", () => {
        const input = {command: "js:process.cwd()"};
        const result = validateRawLaobanCommandObject(ctx("command"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("accepts a raw command object with object guard", () => {
        const input: RawLaobanCommandObject = {
            command: "yarn test",
            guard: {
                value: "${packageDetails.guards.test}",
                default: true,
            },
        };

        const result = validateRawLaobanCommandObject(ctx("command"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a raw command object without command", () => {
        const result = validateRawLaobanCommandObject(ctx("command"), testObservability)({
            status: true,
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a raw command object with non-string command", () => {
        const result = validateRawLaobanCommandObject(ctx("command"), testObservability)({
            command: true,
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a raw command object with invalid status", () => {
        const result = validateRawLaobanCommandObject(ctx("command"), testObservability)({
            command: "yarn test",
            status: "yes",
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateRawLaobanCommand", () => {
    it("accepts a string command", () => {
        const result = validateRawLaobanCommand(ctx("command"), testObservability)("js:process.cwd()");
        expect(valueOrThrow(result)).toBe("js:process.cwd()");
    });

    it("accepts an object command", () => {
        const input = {
            command: "mvn ${passThruArgs}",
            guard: "${packageDetails.guards.mvn}",
        };
        const result = validateRawLaobanCommand(ctx("command"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects an invalid raw command", () => {
        const result = validateRawLaobanCommand(ctx("command"), testObservability)(42 as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateRawLaobanScript", () => {
    const validRawScript: RawLaobanScript = {
        description: "Calls mvn with the arguments",
        inLinksOrder: true,
        commandArgs: {
            passThruArgs: "the arguments that are passed through to maven",
        },
        commands: [
            {
                guard: "${packageDetails.guards.mvn}",
                command: "mvn ${passThruArgs}",
            },
        ],
    };

    it("accepts a valid raw script", () => {
        const result = validateRawLaobanScript(ctx("scripts", "mvn"), testObservability)(validRawScript);
        expect(valueOrThrow(result)).toEqual(validRawScript);
    });

    it("accepts a raw script with object guard", () => {
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

        const result = validateRawLaobanScript(ctx("scripts", "test"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("accepts a raw script with shorthand commands", () => {
        const input: RawLaobanScript = {
            description: "lists the projects with tests in them",
            guard: "${packageDetails.guards.test}",
            commands: ["js:process.cwd()"],
        };
        const result = validateRawLaobanScript(ctx("scripts", "ls-tests"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("accepts a raw script with env", () => {
        const input: RawLaobanScript = {
            description: "runs the pactserver as a stub",
            osGuard: "Windows_NT",
            guard: "${packageDetails.guards.packport}",
            commands: [
                "docker run -t -p  %PORT%:%PORT% -v \"%cwd%/pact/pacts/:/app/pact/pacts\" pactfoundation/pact-stub-server -p %PORT% -d pact/pacts",
            ],
            env: {
                PORT: "${packageDetails.guards.packport}",
            },
        };
        const result = validateRawLaobanScript(ctx("scripts", "runPact"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a raw script without description", () => {
        const result = validateRawLaobanScript(ctx("scripts", "bad"), testObservability)({
            commands: ["echo hello"],
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a raw script without commands", () => {
        const result = validateRawLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a raw script with invalid commands", () => {
        const result = validateRawLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            commands: [123],
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a raw script with invalid commandArgs", () => {
        const result = validateRawLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            commands: ["echo hello"],
            commandArgs: {
                passThruArgs: 42,
            },
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a raw script with invalid env", () => {
        const result = validateRawLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            commands: ["echo hello"],
            env: {
                PORT: false,
            },
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("preserves a non-empty base context for failures", () => {
        const result = validateRawLaobanScript(
            ctx("workspace", "scripts", "bad"),
            testObservability
        )({
            description: "bad script",
            commands: [123],
        } as any);

        const errs = errorsOrThrow(result);
        expect(errs.some(e => e.context.slice(0, 3).join(".") === "workspace.scripts.bad")).toBe(true);
    });
});

describe("validateLaobanCommand", () => {
    const validCommand: LaobanCommand = {
        command: "yarn test",
        status: true,
        name: "test",
        executionScope: 'eachPackage',
        guard: {value: "${packageDetails.guards.test}"},
        directory: "dist",
    };

    it("accepts a valid normalized command", () => {
        const result = validateLaobanCommand(ctx("command"), testObservability)(validCommand);
        expect(valueOrThrow(result)).toEqual(validCommand);
    });

    it("accepts a normalized command with boolean guard value", () => {
        const input: LaobanCommand = {
            command: "yarn test",
            status: true,
            executionScope:'eachPackage',
            guard: {value: true, default: false},
        };

        const result = validateLaobanCommand(ctx("command"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a normalized command without status", () => {
        const result = validateLaobanCommand(ctx("command"), testObservability)({
            command: "yarn test",
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a normalized command without command", () => {
        const result = validateLaobanCommand(ctx("command"), testObservability)({
            status: true,
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a primitive normalized guard", () => {
        const result = validateLaobanCommand(ctx("command"), testObservability)({
            command: "yarn test",
            status: true,
            guard: "${packageDetails.guards.test}",
        } as any);

        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });
});

describe("validateLaobanScript", () => {
    const validScript: LaobanScript = {
        description: "Calls mvn with the arguments",
        inLinksOrder: true,
        showShell: false,
        commandArgs: {
            passThruArgs: "the arguments that are passed through to maven",
        },
        env: {},
        commands: [
            {
                command: "mvn ${passThruArgs}",
                guard: {value: "${packageDetails.guards.mvn}"},
                status: true,
                executionScope: 'eachPackage'
            },
        ],
    };

    it("accepts a valid normalized script", () => {
        const result = validateLaobanScript(ctx("scripts", "mvn"), testObservability)(validScript);
        expect(valueOrThrow(result)).toEqual(validScript);
    });

    it("accepts a normalized script with object guard including default", () => {
        const input: LaobanScript = {
            description: "runs tests",
            guard: {value: "${packageDetails.guards.test}", default: true},
            inLinksOrder: true,
            showShell: true,
            commandArgs: {},
            env: {},
            commands: [
                {
                    command: "${packageManager} test",
                    status: true,
                    executionScope: 'eachPackage'
                },
            ],
        };

        const result = validateLaobanScript(ctx("scripts", "test"), testObservability)(input);
        expect(valueOrThrow(result)).toEqual(input);
    });

    it("rejects a normalized script without inLinksOrder", () => {
        const result = validateLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            showShell: false,
            commandArgs: {},
            env: {},
            commands: [{command: "echo hi", status: true}],
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a normalized script without showShell", () => {
        const result = validateLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            inLinksOrder: false,
            commandArgs: {},
            env: {},
            commands: [{command: "echo hi", status: true}],
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a normalized script without commandArgs", () => {
        const result = validateLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            inLinksOrder: false,
            showShell: false,
            env: {},
            commands: [{command: "echo hi", status: true}],
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a normalized script without env", () => {
        const result = validateLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            inLinksOrder: false,
            showShell: false,
            commandArgs: {},
            commands: [{command: "echo hi", status: true}],
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("rejects a normalized script with shorthand command strings", () => {
        const result = validateLaobanScript(ctx("scripts", "bad"), testObservability)({
            description: "bad script",
            inLinksOrder: false,
            showShell: false,
            commandArgs: {},
            env: {},
            commands: ["echo hi"],
        } as any);
        expect(errorsOrThrow(result).length).toBeGreaterThan(0);
    });

    it("appends nested context to a non-empty base context", () => {
        const result = validateLaobanScript(
            ctx("workspace", "scripts", "bad"),
            testObservability
        )({
            description: "bad script",
            inLinksOrder: false,
            showShell: false,
            commandArgs: {},
            env: {},
            commands: ["echo hi"],
        } as any);

        const errs = errorsOrThrow(result);
        expect(errs.some(e => e.context.join(".").includes("workspace.scripts.bad.commands.0"))).toBe(true);
    });
});