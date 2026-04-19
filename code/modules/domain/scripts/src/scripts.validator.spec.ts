import {
    errorsOrThrow,
    valueOrThrow,
} from "@laoban/errors";
import {recordingObservability} from "@laoban/observability";
import type {ValidationContext, ValidatorDebugContext} from "@laoban/validation";
import {
    validateCommandArgs,
    validateEnv,
    validateLaobanCommand,
    validateLaobanScript,
    validateRawLaobanCommand,
    validateRawLaobanCommandObject,
    validateRawLaobanScript,
    validateScriptGuard,
} from "./scripts.validator";
import {
    LaobanCommand,
    LaobanScript,
    RawLaobanCommandObject,
    RawLaobanScript,
} from "./scripts.domain";

const {observability: testObservability} =
    recordingObservability<ValidatorDebugContext>();

const ctx = (...parts: string[]): ValidationContext => parts;

describe("validateScriptGuard", () => {
    it("accepts a boolean guard", () => {
        const result = validateScriptGuard(ctx("guard"), testObservability)(true);
        expect(valueOrThrow(result)).toBe(true);
    });

    it("accepts a string guard", () => {
        const result = validateScriptGuard(ctx("guard"), testObservability)(
            "${packageDetails.guards.test}"
        );
        expect(valueOrThrow(result)).toBe("${packageDetails.guards.test}");
    });

    it("rejects a number guard", () => {
        const result = validateScriptGuard(ctx("guard"), testObservability)(42 as any);
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
        guard: "${packageDetails.guards.test}",
        directory: "dist",
    };

    it("accepts a valid normalized command", () => {
        const result = validateLaobanCommand(ctx("command"), testObservability)(validCommand);
        expect(valueOrThrow(result)).toEqual(validCommand);
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
                guard: "${packageDetails.guards.mvn}",
                status: true,
            },
        ],
    };

    it("accepts a valid normalized script", () => {
        const result = validateLaobanScript(ctx("scripts", "mvn"), testObservability)(validScript);
        expect(valueOrThrow(result)).toEqual(validScript);
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