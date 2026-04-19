import {
    validateCliCommand,
    validateCliFieldDef,
    validateCliFields,
    validateCliGroup,
    validateCliModel,
    type CliValidationDebugContext,
} from "./cli.dsl.validation";
import {
    type CliCommand,
    type CliFieldDef,
    type CliGroup,
    type CliModel,
} from "./cli.dsl";
import {isErrors, value, type ErrorsOr} from "@laoban/errors";
import {type ValidationIssue} from "@laoban/validation";
import {type Observability} from "@laoban/observability";

function makeObservability(): Observability<CliValidationDebugContext> {
    return {
        correlationId: "test-correlation-id",
        logger: jest.fn(),
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
        debugLevels: {},
        timeService: {now: () => 0},
    };
}

function issuesOf<T>(result: ErrorsOr<T, ValidationIssue>): ValidationIssue[] {
    return isErrors(result) ? result.errors : [];
}

describe("validateCliFieldDef", () => {
    test("accepts positionalString", () => {
        const field: CliFieldDef = {
            kind: "positionalString",
            description: "A positional string",
            required: true,
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });

    test("accepts optionBoolean with shortName", () => {
        const field: CliFieldDef = {
            kind: "optionBoolean",
            description: "A boolean option",
            shortName: "d",
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });
    test("accepts optionBoolean without shortName", () => {
        const field: CliFieldDef = {
            kind: "optionBoolean",
            description: "Force mode",
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });

    test("accepts optionNumber without shortName", () => {
        const field: CliFieldDef = {
            kind: "optionNumber",
            description: "Timeout",
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });
    test("rejects blank description", () => {
        const field = {
            kind: "optionString",
            description: "   ",
            shortName: "x",
        } as any;
        expect(issuesOf(validateCliFieldDef(["field"], makeObservability())(field))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["field", "description"],
                message: "field.description must not be blank",
                code: "blank",
            },
        ]);
    });

    test("rejects option shortName longer than one character", () => {
        const field = {
            kind: "optionString",
            description: "desc",
            shortName: "xx",
        } as any;
        expect(issuesOf(validateCliFieldDef(["field"], makeObservability())(field))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["field", "shortName"],
                message: "field.shortName must have length = 1",
                code: "exact.length",
            },
        ]);
    });

    test("rejects illegal kind", () => {
        const field = {
            kind: "banana",
            description: "desc",
        } as any;
        expect(issuesOf(validateCliFieldDef(["field"], makeObservability())(field))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["field"],
                message: "field has illegal type banana. Legal values are: optionBoolean, optionNumber, optionString, optionStrings, positionalNumber, positionalString, positionalStrings",
                code: "illegal.type",
            },
        ]);
    });
});

describe("validateCliFields", () => {
    test("accepts valid fields", () => {
        const fields = {
            input: {
                kind: "positionalString",
                description: "Input file",
                required: true,
            },
            dryRun: {
                kind: "optionBoolean",
                description: "Dry run",
                shortName: "d",
            },
        } satisfies Record<string, CliFieldDef>;

        expect(validateCliFields(["fields"], makeObservability())(fields)).toEqual(value(fields));
    });

    test("rejects duplicate option short names", () => {
        const fields = {
            one: {
                kind: "optionString",
                description: "One",
                shortName: "x",
            },
            two: {
                kind: "optionBoolean",
                description: "Two",
                shortName: "x",
            },
        } as const;

        expect(issuesOf(validateCliFields(["fields"], makeObservability())(fields as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["fields", "two", "shortName"],
                message: "fields.two.shortName duplicates shortName 'x' already used by 'one'",
                code: "duplicate.shortName",
            },
        ]);
    });

    test("rejects required positional after optional positional", () => {
        const fields = {
            first: {
                kind: "positionalString",
                description: "First",
                required: false,
            },
            second: {
                kind: "positionalNumber",
                description: "Second",
                required: true,
            },
        } as const;

        expect(issuesOf(validateCliFields(["fields"], makeObservability())(fields as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["fields", "second", "required"],
                message: "fields.second.required required positional fields cannot appear after optional positional fields",
                code: "illegal.order",
            },
        ]);
    });

    test("rejects positional field after variadic positional strings", () => {
        const fields = {
            files: {
                kind: "positionalStrings",
                description: "Files",
                variadic: true,
            },
            mode: {
                kind: "positionalString",
                description: "Mode",
            },
        } as const;

        expect(issuesOf(validateCliFields(["fields"], makeObservability())(fields as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["fields", "mode"],
                message: "fields.mode appears after a variadic positional field",
                code: "illegal.order",
            },
        ]);
    });
});

describe("validateCliCommand", () => {
    const execute = async () => {
    };

    test("accepts valid command", () => {
        const command: CliCommand<any> = {
            description: "Run something",
            fields: {
                input: {
                    kind: "positionalString",
                    description: "Input",
                },
                dryRun: {
                    kind: "optionBoolean",
                    description: "Dry run",
                    shortName: "d",
                },
            },
            execute,
        };

        expect(validateCliCommand(["command"], makeObservability())(command)).toEqual(value(command));
    });

    test("rejects blank description", () => {
        const command = {
            description: "  ",
            fields: {},
            execute,
        } as any;

        expect(issuesOf(validateCliCommand(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command", "description"],
                message: "command.description must not be blank",
                code: "blank",
            },
        ]);
    });

    test("rejects non-function execute", () => {
        const command = {
            description: "desc",
            fields: {},
            execute: 123,
        } as any;

        expect(issuesOf(validateCliCommand(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command", "execute"],
                message: "command.execute must be a function",
                code: "wrong.type",
            },
        ]);
    });
});

describe("validateCliGroup", () => {
    const execute = async () => {
    };

    test("accepts valid group", () => {
        const group: CliGroup = {
            description: "Root group",
            commands: {
                update: {
                    description: "Update",
                    fields: {},
                    execute,
                },
            },
            groups: {
                admin: {
                    description: "Admin commands",
                    commands: {
                        clean: {
                            description: "Clean",
                            fields: {},
                            execute,
                        },
                    },
                },
            },
        };

        expect(validateCliGroup(["group"], makeObservability())(group)).toEqual(value(group));
    });

    test("rejects overlapping command and group names", () => {
        const group: CliGroup = {
            description: "Root group",
            commands: {
                admin: {
                    description: "A command called admin",
                    fields: {},
                    execute,
                },
            },
            groups: {
                admin: {
                    description: "A group also called admin",
                },
            },
        };

        expect(issuesOf(validateCliGroup(["group"], makeObservability())(group))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["group"],
                message: "group contains both a command and a group named 'admin'",
                code: "duplicate.name",
            },
        ]);
    });

    test("rejects blank group description", () => {
        const group = {
            description: "",
        } as any;

        expect(issuesOf(validateCliGroup(["group"], makeObservability())(group))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["group", "description"],
                message: "group.description must not be blank",
                code: "blank",
            },
        ]);
    });
});

describe("validateCliModel", () => {
    const execute = async () => {
    };

    test("accepts full model", () => {
        const model: CliModel = {
            description: "Laoban",
            commands: {
                update: {
                    description: "Update workspace",
                    fields: {
                        dryRun: {
                            kind: "optionBoolean",
                            description: "Dry run",
                            shortName: "d",
                        },
                    },
                    execute,
                },
            },
            groups: {
                admin: {
                    description: "Admin commands",
                    commands: {
                        reset: {
                            description: "Reset state",
                            fields: {},
                            execute,
                        },
                    },
                },
            },
        };

        expect(validateCliModel(["model"], makeObservability())(model)).toEqual(value(model));
    });

    test("propagates nested command field errors", () => {
        const model = {
            description: "Laoban",
            groups: {
                admin: {
                    description: "Admin commands",
                    commands: {
                        reset: {
                            description: "Reset state",
                            fields: {
                                force: {
                                    kind: "optionString",
                                    description: "Force",
                                    shortName: "xx",
                                },
                            },
                            execute,
                        },
                    },
                },
            },
        } as any;

        expect(issuesOf(validateCliModel(["model"], makeObservability())(model))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["model", "groups", "admin", "commands", "reset", "fields", "force", "shortName"],
                message: "model.groups.admin.commands.reset.fields.force.shortName must have length = 1",
                code: "exact.length",
            },
        ]);
    });
});

describe('validateCliFieldDef specific field kinds', () => {
    test("accepts positionalStrings with variadic", () => {
        const field: CliFieldDef = {
            kind: "positionalStrings",
            description: "Input files",
            variadic: true,
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });

    test("accepts positionalNumber", () => {
        const field: CliFieldDef = {
            kind: "positionalNumber",
            description: "Retry count",
            required: true,
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });

    test("accepts optionString without shortName", () => {
        const field: CliFieldDef = {
            kind: "optionString",
            description: "Output file",
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });

    test("accepts optionStrings", () => {
        const field: CliFieldDef = {
            kind: "optionStrings",
            description: "Tags",
            shortName: "t",
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });

    test("accepts optionNumber", () => {
        const field: CliFieldDef = {
            kind: "optionNumber",
            description: "Timeout",
            shortName: "n",
        };
        expect(validateCliFieldDef(["field"], makeObservability())(field)).toEqual(value(field));
    });

});
describe('missing kinds', () => {
    test("rejects missing kind", () => {
        const field = {
            description: "desc",
        } as any;

        expect(issuesOf(validateCliFieldDef(["field"], makeObservability())(field))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["field"],
                message: "field has no valid type",
                code: "missing.type",
            },
        ]);
    });
});