import type { Observability } from "@laoban/observability";
import type { CliGroup } from "./cli.dsl";
import {
    addCliModelToCommander,
    type CommanderAdapterConfig
} from "./cli.dsl.command.adapter.config";
import type { CliWalkerDebugContext } from "./cli.dsl.walker";

type FakeCommand = {
    name?: string;
    descriptionText?: string;
    children: FakeCommand[];
    command: jest.MockedFunction<(name: string) => FakeCommand>;
    description: jest.MockedFunction<(description: string) => FakeCommand>;
    option: jest.MockedFunction<(...args: any[]) => FakeCommand>;
    requiredOption: jest.MockedFunction<(...args: any[]) => FakeCommand>;
};

function makeFakeCommand(name?: string): FakeCommand {
    const fake: Partial<FakeCommand> = {
        name,
        children: []
    };

    fake.command = jest.fn((childName: string) => {
        const child = makeFakeCommand(childName);
        fake.children!.push(child);
        return child;
    });

    fake.description = jest.fn((description: string) => {
        fake.descriptionText = description;
        return fake as FakeCommand;
    });

    fake.option = jest.fn(() => fake as FakeCommand);
    fake.requiredOption = jest.fn(() => fake as FakeCommand);

    return fake as FakeCommand;
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

describe("addCliModelToCommander", () => {
    test("returns the original program", () => {
        const program = makeFakeCommand("root");
        const observability = makeObservability();

        const model: CliGroup = {
            nodeType: "group",
            description: "Root CLI",
            children: {}
        };

        const config: CommanderAdapterConfig = {
            observability,
            addAction: jest.fn(cmd => cmd as any)
        };

        const result = addCliModelToCommander(program as any, model, config);

        expect(result).toBe(program);
    });

    test("creates a group using parent.command(name).description(group.description)", () => {
        const program = makeFakeCommand("root");
        const observability = makeObservability();

        const model: CliGroup = {
            nodeType: "group",
            description: "Root CLI",
            children: {
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {}
                }
            }
        };

        const config: CommanderAdapterConfig = {
            observability,
            addAction: jest.fn(cmd => cmd as any)
        };

        addCliModelToCommander(program as any, model, config);

        expect(program.command).toHaveBeenCalledWith("admin");
        expect(program.children).toHaveLength(1);
        expect(program.children[0].name).toBe("admin");
        expect(program.children[0].description).toHaveBeenCalledWith("Admin commands");
        expect(config.addAction).not.toHaveBeenCalled();
    });

    test("creates a leaf command with positional signature, then adds options and action", () => {
        const program = makeFakeCommand("root");
        const observability = makeObservability();

        const model: CliGroup = {
            nodeType: "group",
            description: "Root CLI",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build workspace",
                    positionals: {
                        target: { type: "string", description: "Target", required: true },
                        files: { type: "string[]", description: "Files" }
                    },
                    options: {
                        verbose: { type: "boolean", description: "Verbose", shortName: "v" }
                    },
                    execute: async () => {}
                }
            }
        };

        const config: CommanderAdapterConfig = {
            observability,
            addAction: jest.fn(cmd => cmd as any)
        };

        addCliModelToCommander(program as any, model, config);

        expect(program.command).toHaveBeenCalledWith("build <target> [files...]");
        expect(program.children).toHaveLength(1);
        expect(program.children[0].name).toBe("build <target> [files...]");
        expect(program.children[0].description).toHaveBeenCalledWith("Build workspace");
        expect(program.children[0].option).toHaveBeenCalledWith("-v, --verbose", "Verbose");
        expect(config.addAction).toHaveBeenCalledTimes(1);
        expect(config.addAction).toHaveBeenCalledWith(program.children[0], model.children.build);
    });

    test("adds optional and required options with default values", () => {
        const program = makeFakeCommand("root");
        const observability = makeObservability();

        const model: CliGroup = {
            nodeType: "group",
            description: "Root CLI",
            children: {
                publish: {
                    nodeType: "command",
                    description: "Publish package",
                    positionals: {},
                    options: {
                        registry: { type: "string", description: "Registry", defaultValue: "https://registry.npmjs.org" },
                        retries: { type: "number", description: "Retries", defaultValue: 3 },
                        token: { type: "string", description: "Token", required: true },
                        tag: { type: "string[]", description: "Tags" }
                    },
                    execute: async () => {}
                }
            }
        };

        const config: CommanderAdapterConfig = {
            observability,
            addAction: jest.fn(cmd => cmd as any)
        };

        addCliModelToCommander(program as any, model, config);

        const publish = program.children[0];

        expect(publish.option).toHaveBeenCalledWith(
            "--registry <registry>",
            "Registry",
            "https://registry.npmjs.org"
        );
        expect(publish.option).toHaveBeenCalledWith(
            "--retries <retries>",
            "Retries",
            3
        );
        expect(publish.requiredOption).toHaveBeenCalledWith(
            "--token <token>",
            "Token"
        );
        expect(publish.option).toHaveBeenCalledWith(
            "--tag <tag...>",
            "Tags"
        );
    });

    test("walks nested groups and leaf commands", () => {
        const program = makeFakeCommand("root");
        const observability = makeObservability();

        const model: CliGroup = {
            nodeType: "group",
            description: "Root CLI",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build workspace",
                    positionals: {},
                    options: {},
                    execute: async () => {}
                },
                project: {
                    nodeType: "group",
                    description: "Project commands",
                    children: {
                        init: {
                            nodeType: "command",
                            description: "Initialise project",
                            positionals: {},
                            options: {},
                            execute: async () => {}
                        }
                    }
                }
            }
        };

        const config: CommanderAdapterConfig = {
            observability,
            addAction: jest.fn(cmd => cmd as any)
        };

        addCliModelToCommander(program as any, model, config);

        expect(program.children.map(c => c.name)).toEqual(["build", "project"]);

        const build = program.children[0];
        const project = program.children[1];

        expect(build.descriptionText).toBe("Build workspace");
        expect(project.descriptionText).toBe("Project commands");
        expect(project.children.map(c => c.name)).toEqual(["init"]);
        expect(project.children[0].descriptionText).toBe("Initialise project");
    });

    test("emits debug logging through observability", () => {
        const program = makeFakeCommand("root");
        const observability = makeObservability();

        const model: CliGroup = {
            nodeType: "group",
            description: "Root CLI",
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
                    children: {}
                }
            }
        };

        const config: CommanderAdapterConfig = {
            observability,
            addAction: jest.fn(cmd => cmd as any)
        };

        addCliModelToCommander(program as any, model, config);

        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI model"
        );
        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI command build"
        );
        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI group admin"
        );
    });
});