import type { Observability } from "@laoban/observability";
import {
    type AnyCliCommand,
    type CliGroup
} from "./cli.dsl";
import {
    type CliWalkerDebugContext,
    type CliWalkerConfig,
    walkCliGroupChildren,
    walkCliModel,
    walkCliNode
} from "./cli.dsl.walker";

type FakeAcc = {
    groups: Array<{ name: string; description: string }>;
    commands: Array<{ name: string; description: string }>;
    childrenByGroupName: Record<string, FakeAcc>;
};

function makeAcc(): FakeAcc {
    return {
        groups: [],
        commands: [],
        childrenByGroupName: {}
    };
}

function makeObservability(): Observability<CliWalkerDebugContext> {
    return {
        correlationId: "test-correlation-id",
        logger: jest.fn(),
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
        debugLevels: {},
        timeService: { now: () => 0 }
    };
}

function makeConfig(
    observability: Observability<CliWalkerDebugContext>
): CliWalkerConfig<FakeAcc> {
    return {
        observability,
        addGroup: (parent, name, group) => {
            parent.groups.push({ name, description: group.description });
            const child = makeAcc();
            parent.childrenByGroupName[name] = child;
            return child;
        },
        addLeafCommand: (parent, name, command) => {
            parent.commands.push({ name, description: command.description });
        }
    };
}

describe("walkCliNode", () => {
    test("walks a leaf command by calling addLeafCommand", () => {
        const observability = makeObservability();
        const config = makeConfig(observability);
        const acc = makeAcc();

        const command: AnyCliCommand = {
            nodeType: "command",
            description: "Build project",
            positionals: {},
            options: {},
            execute: async () => {}
        };

        const result = walkCliNode(acc, "build", command, config);

        expect(result).toBe(acc);
        expect(acc.commands).toEqual([
            { name: "build", description: "Build project" }
        ]);
        expect(acc.groups).toEqual([]);
        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI command build"
        );
    });

    test("walks a group by calling addGroup and recursing into its children", () => {
        const observability = makeObservability();
        const config = makeConfig(observability);
        const acc = makeAcc();

        const group: CliGroup = {
            nodeType: "group",
            description: "Admin commands",
            children: {
                reset: {
                    nodeType: "command",
                    description: "Reset state",
                    positionals: {},
                    options: {},
                    execute: async () => {}
                }
            }
        };

        const result = walkCliNode(acc, "admin", group, config);

        expect(result).toBe(acc);
        expect(acc.groups).toEqual([
            { name: "admin", description: "Admin commands" }
        ]);
        expect(acc.commands).toEqual([]);
        expect(acc.childrenByGroupName.admin.commands).toEqual([
            { name: "reset", description: "Reset state" }
        ]);
        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI group admin"
        );
        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI command reset"
        );
    });

    test("throws a helpful error for an unreachable node shape", () => {
        const observability = makeObservability();
        const config = makeConfig(observability);
        const acc = makeAcc();

        const badNode = {
            nodeType: "banana",
            description: "Nope"
        } as any;

        expect(() => walkCliNode(acc, "bad", badNode, config)).toThrow(
            "walkCliNode reached an unreachable branch for node 'bad'"
        );
    });
});

describe("walkCliGroupChildren", () => {
    test("walks all children in order", () => {
        const observability = makeObservability();
        const config = makeConfig(observability);
        const acc = makeAcc();

        const group: CliGroup = {
            nodeType: "group",
            description: "Root",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build workspace",
                    positionals: {},
                    options: {},
                    execute: async () => {}
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
                            execute: async () => {}
                        }
                    }
                }
            }
        };

        const result = walkCliGroupChildren(acc, group, config);

        expect(result).toBe(acc);
        expect(acc.commands).toEqual([
            { name: "build", description: "Build workspace" }
        ]);
        expect(acc.groups).toEqual([
            { name: "admin", description: "Admin commands" }
        ]);
        expect(acc.childrenByGroupName.admin.commands).toEqual([
            { name: "reset", description: "Reset state" }
        ]);
    });
});

describe("walkCliModel", () => {
    test("walks a full model and returns the original accumulator", () => {
        const observability = makeObservability();
        const config = makeConfig(observability);
        const acc = makeAcc();

        const model: CliGroup = {
            nodeType: "group",
            description: "Laoban",
            children: {
                update: {
                    nodeType: "command",
                    description: "Update workspace",
                    positionals: {},
                    options: {},
                    execute: async () => {}
                },
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {
                        repair: {
                            nodeType: "command",
                            description: "Repair state",
                            positionals: {},
                            options: {},
                            execute: async () => {}
                        }
                    }
                }
            }
        };

        const result = walkCliModel(acc, model, config);

        expect(result).toBe(acc);
        expect(acc.commands).toEqual([
            { name: "update", description: "Update workspace" }
        ]);
        expect(acc.groups).toEqual([
            { name: "admin", description: "Admin commands" }
        ]);
        expect(acc.childrenByGroupName.admin.commands).toEqual([
            { name: "repair", description: "Repair state" }
        ]);
        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI model"
        );
    });
});