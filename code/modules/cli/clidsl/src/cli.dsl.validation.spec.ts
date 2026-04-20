import {isErrors, value, type ErrorsOr, valueOrThrow} from "@laoban/errors";
import {type ValidationIssue} from "@laoban/validation";
import {type Observability} from "@laoban/observability";
import {
    makeValidateCliCommandDef,
    makeValidateCliGroupDef,
    makeValidateCliModel,
    makeValidateCliNode,
    validateCliOptionParameterDef,
    validateCliPositionalParameterDef
} from "./cli.dsl.validation";
import type {CliGroup, CliModel} from "./cli.dsl";
import {exampleCli} from "./cli.dsl.example";

function makeObservability(): Observability {
    return {
        correlationId: "test-correlation-id",
        logger: jest.fn(),
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
        debugLevels: {},
        timeService: {now: () => 0}
    };
}

function issuesOf<T>(result: ErrorsOr<T, ValidationIssue>): ValidationIssue[] {
    return isErrors(result) ? result.errors : [];
}

describe("validateCliPositionalParameterDef", () => {
    test("accepts string positional parameter", () => {
        const param = {
            type: "string" as const,
            description: "Input file",
            required: true
        };

        expect(validateCliPositionalParameterDef(["param"], makeObservability())(param)).toEqual(value(param));
    });

    test("accepts number positional parameter", () => {
        const param = {
            type: "number" as const,
            description: "Retry count"
        };

        expect(validateCliPositionalParameterDef(["param"], makeObservability())(param)).toEqual(value(param));
    });

    test("accepts string[] positional parameter", () => {
        const param = {
            type: "string[]" as const,
            description: "Files"
        };

        expect(validateCliPositionalParameterDef(["param"], makeObservability())(param)).toEqual(value(param));
    });

    test("rejects blank description", () => {
        const param = {
            type: "string",
            description: "   "
        } as any;

        expect(issuesOf(validateCliPositionalParameterDef(["param"], makeObservability())(param))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["param", "description"],
                message: "param.description must not be blank",
                code: "blank"
            }
        ]);
    });

    test("rejects illegal type", () => {
        const param = {
            type: "boolean",
            description: "Nope"
        } as any;

        expect(issuesOf(validateCliPositionalParameterDef(["param"], makeObservability())(param))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["param"],
                message: "param has illegal type boolean. Legal values are: number, string, string[]",
                code: "illegal.type"
            }
        ]);
    });

    test("rejects missing type", () => {
        const param = {
            description: "Input"
        } as any;

        expect(issuesOf(validateCliPositionalParameterDef(["param"], makeObservability())(param))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["param"],
                message: "param has no valid type",
                code: "missing.type"
            }
        ]);
    });
});

describe("validateCliOptionParameterDef", () => {
    test("accepts string option parameter", () => {
        const param = {
            type: "string" as const,
            description: "Output",
            shortName: "o",
            defaultValue: "dist"
        };

        expect(validateCliOptionParameterDef(["param"], makeObservability())(param)).toEqual(value(param));
    });

    test("accepts number option parameter", () => {
        const param = {
            type: "number" as const,
            description: "Retries",
            defaultValue: 3
        };

        expect(validateCliOptionParameterDef(["param"], makeObservability())(param)).toEqual(value(param));
    });

    test("accepts boolean option parameter", () => {
        const param = {
            type: "boolean" as const,
            description: "Verbose",
            shortName: "v"
        };

        expect(validateCliOptionParameterDef(["param"], makeObservability())(param)).toEqual(value(param));
    });

    test("accepts string[] option parameter", () => {
        const param = {
            type: "string[]" as const,
            description: "Tags",
            shortName: "t",
            defaultValue: ["alpha", "beta"] as string[]
        };

        expect(validateCliOptionParameterDef(["param"], makeObservability())(param)).toEqual(value(param));
    });

    test("rejects shortName longer than one character", () => {
        const param = {
            type: "string",
            description: "Output",
            shortName: "xx"
        } as any;

        expect(issuesOf(validateCliOptionParameterDef(["param"], makeObservability())(param))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["param", "shortName"],
                message: "param.shortName must have length = 1",
                code: "exact.length"
            }
        ]);
    });

    test("rejects wrong defaultValue type for number", () => {
        const param = {
            type: "number",
            description: "Retries",
            defaultValue: "3"
        } as any;

        expect(issuesOf(validateCliOptionParameterDef(["param"], makeObservability())(param))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["param", "defaultValue"],
                message: "param.defaultValue must be a number but was a string",
                code: "wrong.type"
            }
        ]);
    });

    test("rejects wrong defaultValue type for string[]", () => {
        const param = {
            type: "string[]",
            description: "Tags",
            defaultValue: ["ok", 2]
        } as any;

        expect(issuesOf(validateCliOptionParameterDef(["param"], makeObservability())(param))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["param", "defaultValue", "1"],
                message: "param.defaultValue.1 must be a string but was a number",
                code: "wrong.type"
            }
        ]);
    });

    test("rejects illegal type", () => {
        const param = {
            type: "banana",
            description: "Nope"
        } as any;

        expect(issuesOf(validateCliOptionParameterDef(["param"], makeObservability())(param))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["param"],
                message: "param has illegal type banana. Legal values are: boolean, number, string, string[]",
                code: "illegal.type"
            }
        ]);
    });
});

describe("makeValidateCliCommandDef", () => {
    const execute = async () => {
    };

    test("accepts valid command", () => {
        const command = {
            nodeType: "command" as const,
            description: "Build project",
            positionals: {
                target: {
                    type: "string" as const,
                    description: "Target"
                }
            },
            options: {
                verbose: {
                    type: "boolean" as const,
                    description: "Verbose",
                    shortName: "v"
                }
            },
            execute
        };

        expect(makeValidateCliCommandDef()(["command"], makeObservability())(command)).toEqual(value(command));
    });

    test("rejects blank description", () => {
        const command = {
            nodeType: "command",
            description: "   ",
            positionals: {},
            options: {},
            execute
        } as any;

        expect(issuesOf(makeValidateCliCommandDef()(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command", "description"],
                message: "command.description must not be blank",
                code: "blank"
            }
        ]);
    });

    test("rejects non-function execute", () => {
        const command = {
            nodeType: "command",
            description: "Build project",
            positionals: {},
            options: {},
            execute: 123
        } as any;

        expect(issuesOf(makeValidateCliCommandDef()(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command", "execute"],
                message: "command.execute must be a function but was a number",
                code: "wrong.type"
            }
        ]);
    });

    test("rejects overlapping positional and option keys", () => {
        const command = {
            nodeType: "command",
            description: "Build project",
            positionals: {
                target: {
                    type: "string",
                    description: "Target"
                }
            },
            options: {
                target: {
                    type: "string",
                    description: "Target again"
                }
            },
            execute
        } as any;

        expect(issuesOf(makeValidateCliCommandDef()(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command"],
                message: "command has keys present in both positionals and options: target",
                code: "duplicate.key"
            }
        ]);
    });

    test("rejects duplicate shortName values", () => {
        const command = {
            nodeType: "command",
            description: "Build project",
            positionals: {},
            options: {
                verbose: {
                    type: "boolean",
                    description: "Verbose",
                    shortName: "v"
                },
                version: {
                    type: "boolean",
                    description: "Version",
                    shortName: "v"
                }
            },
            execute
        } as any;

        expect(issuesOf(makeValidateCliCommandDef()(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command"],
                message: "command has duplicate shortName values: v",
                code: "duplicate.shortName"
            }
        ]);
    });

    test("propagates nested positional parameter errors", () => {
        const command = {
            nodeType: "command",
            description: "Build project",
            positionals: {
                target: {
                    type: "boolean",
                    description: "Nope"
                }
            },
            options: {},
            execute
        } as any;

        expect(issuesOf(makeValidateCliCommandDef()(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command", "positionals", "target"],
                message: "command.positionals.target has illegal type boolean. Legal values are: number, string, string[]",
                code: "illegal.type"
            }
        ]);
    });

    test("propagates nested option parameter errors", () => {
        const command = {
            nodeType: "command",
            description: "Build project",
            positionals: {},
            options: {
                verbose: {
                    type: "boolean",
                    description: "Verbose",
                    shortName: "xx"
                }
            },
            execute
        } as any;

        expect(issuesOf(makeValidateCliCommandDef()(["command"], makeObservability())(command))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["command", "options", "verbose", "shortName"],
                message: "command.options.verbose.shortName must have length = 1",
                code: "exact.length"
            }
        ]);
    });
});

describe("makeValidateCliGroupDef", () => {
    const execute = async () => {
    };

    test("accepts valid group", () => {
        const group: CliGroup = {
            nodeType: "group",
            description: "Root group",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build",
                    positionals: {},
                    options: {},
                    execute
                },
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {
                        reset: {
                            nodeType: "command",
                            description: "Reset",
                            positionals: {},
                            options: {},
                            execute
                        }
                    }
                }
            }
        };

        expect(makeValidateCliGroupDef()(["group"], makeObservability())(group)).toEqual(value(group));
    });

    test("rejects blank group description", () => {
        const group = {
            nodeType: "group",
            description: "",
            children: {}
        } as any;

        expect(issuesOf(makeValidateCliGroupDef()(["group"], makeObservability())(group))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["group", "description"],
                message: "group.description must not be blank",
                code: "blank"
            }
        ]);
    });

    test("propagates nested child errors", () => {
        const group = {
            nodeType: "group",
            description: "Root",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build",
                    positionals: {},
                    options: {
                        verbose: {
                            type: "boolean",
                            description: "Verbose",
                            shortName: "xx"
                        }
                    },
                    execute
                }
            }
        } as any;

        expect(issuesOf(makeValidateCliGroupDef()(["group"], makeObservability())(group))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["group", "children", "build", "options", "verbose", "shortName"],
                message: "group.children.build.options.verbose.shortName must have length = 1",
                code: "exact.length"
            }
        ]);
    });
});

describe("makeValidateCliNode", () => {
    const execute = async () => {
    };

    test("accepts command node", () => {
        const node = {
            nodeType: "command" as const,
            description: "Build",
            positionals: {},
            options: {},
            execute
        };

        expect(makeValidateCliNode()(["node"], makeObservability())(node)).toEqual(value(node));
    });

    test("accepts group node", () => {
        const node = {
            nodeType: "group" as const,
            description: "Admin",
            children: {}
        };

        expect(makeValidateCliNode()(["node"], makeObservability())(node)).toEqual(value(node));
    });

    test("rejects illegal nodeType", () => {
        const node = {
            nodeType: "banana",
            description: "Nope"
        } as any;

        expect(issuesOf(makeValidateCliNode()(["node"], makeObservability())(node))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["node"],
                message: "node has illegal type banana. Legal values are: command, group",
                code: "illegal.type"
            }
        ]);
    });
});

describe("makeValidateCliModel", () => {
    const execute = async () => {
    };

    test("accepts full model", () => {
        const model: CliModel = {
            nodeType: "group",
            description: "Laoban",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build workspace",
                    positionals: {
                        target: {
                            type: "string",
                            description: "Target"
                        }
                    },
                    options: {
                        dryRun: {
                            type: "boolean",
                            description: "Dry run",
                            shortName: "d"
                        }
                    },
                    execute
                },
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {
                        reset: {
                            nodeType: "command",
                            description: "Reset state",
                            positionals: {},
                            options: {},
                            execute
                        }
                    }
                }
            }
        };

        expect(makeValidateCliModel()(["model"], makeObservability())(model)).toEqual(value(model));
    });

    test("propagates nested command option errors", () => {
        const model = {
            nodeType: "group",
            description: "Laoban",
            children: {
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {
                        reset: {
                            nodeType: "command",
                            description: "Reset state",
                            positionals: {},
                            options: {
                                force: {
                                    type: "string",
                                    description: "Force",
                                    shortName: "xx"
                                }
                            },
                            execute
                        }
                    }
                }
            }
        } as any;

        expect(issuesOf(makeValidateCliModel()(["model"], makeObservability())(model))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["model", "children", "admin", "children", "reset", "options", "force", "shortName"],
                message: "model.children.admin.children.reset.options.force.shortName must have length = 1",
                code: "exact.length"
            }
        ]);
    });
});

describe("check example validates", () => {
    it('should validate the example CLI model without errors', () => {
        const example = exampleCli;
        const result = makeValidateCliModel()(["example"], makeObservability())(example);
        valueOrThrow(result);
    })
})