import type {Observability} from "@laoban/observability";
import type {AnyCliCommand, CliRoot} from "./cli.dsl";
import {
    addOptionsToCommand,
    createLeafCommandSpec,
    interpretCliModel,
    type CliModelInterpreterConfig,
    type CommandBuilderApi
} from "./cli.dsl.command.adapter.config";

type FakeCmd = {
    id: string;
    rootName?: string;
    rootDescription?: string;
    rootVersion?: string;
    groups: Array<{ name: string; description: string; child: FakeCmd }>;
    commands: Array<{ spec: string; description: string; child: FakeCmd }>;
    options: Array<{
        flags: string;
        description: string;
        required: boolean;
        defaultValue?: unknown;
    }>;
    actionFor?: AnyCliCommand;
};

let nextId = 0;

function makeCmd(id?: string): FakeCmd {
    return {
        id: id ?? `cmd-${++nextId}`,
        groups: [],
        commands: [],
        options: []
    };
}

function makeApi(): CommandBuilderApi<FakeCmd> {
    return {
        setRootName: (cmd, name) => {
            cmd.rootName = name;
            return cmd;
        },
        setRootDescription: (cmd, description) => {
            cmd.rootDescription = description;
            return cmd;
        },
        setRootVersion: (cmd, version) => {
            cmd.rootVersion = version;
            return cmd;
        },
        addGroup: (parent, name, description) => {
            const child = makeCmd(`group:${name}`);
            parent.groups.push({name, description, child});
            return child;
        },
        addCommand: (parent, commandSpec, description) => {
            const child = makeCmd(`command:${commandSpec}`);
            parent.commands.push({spec: commandSpec, description, child});
            return child;
        },
        addOption: (cmd, flags, description, required, defaultValue) => {
            cmd.options.push({flags, description, required, defaultValue});
            return cmd;
        }
    };
}

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

describe("createLeafCommandSpec", () => {
    test("returns just the command name when there are no positionals", () => {
        const cliCommand: AnyCliCommand = {
            nodeType: "command",
            description: "Build workspace",
            positionals: {},
            options: {},
            execute: async () => {
            }
        };

        expect(createLeafCommandSpec("build", cliCommand)).toBe("build");
    });

    test("renders string, number and string[] positional tokens correctly", () => {
        const cliCommand: AnyCliCommand = {
            nodeType: "command",
            description: "Run command",
            positionals: {
                requiredTarget: {type: "string", description: "Target", required: true},
                optionalRetryCount: {type: "number", description: "Retries"},
                files: {type: "string[]", description: "Files", required: true},
                extras: {type: "string[]", description: "Extras"}
            },
            options: {},
            execute: async () => {
            }
        };

        expect(createLeafCommandSpec("run", cliCommand))
            .toBe("run <requiredTarget> [optionalRetryCount] <files...> [extras...]");
    });
});

describe("addOptionsToCommand", () => {
    test("adds boolean, string, number and string[] options", () => {
        const cmd = makeCmd("leaf");
        const api = makeApi();

        const cliCommand: AnyCliCommand = {
            nodeType: "command",
            description: "Publish package",
            positionals: {},
            options: {
                verbose: {type: "boolean", description: "Verbose", shortName: "v"},
                registry: {type: "string", description: "Registry"},
                retries: {type: "number", description: "Retries", defaultValue: 3},
                tags: {type: "string[]", description: "Tags"}
            },
            execute: async () => {
            }
        };

        const result = addOptionsToCommand(cmd, cliCommand, api);

        expect(result).toBe(cmd);
        expect(cmd.options).toEqual([
            {
                flags: "-v, --verbose",
                description: "Verbose",
                required: false,
                defaultValue: undefined
            },
            {
                flags: "--registry <registry>",
                description: "Registry",
                required: false,
                defaultValue: undefined
            },
            {
                flags: "--retries <retries>",
                description: "Retries",
                required: false,
                defaultValue: 3
            },
            {
                flags: "--tags <tags...>",
                description: "Tags",
                required: false,
                defaultValue: undefined
            }
        ]);
    });

    test("marks required options as required", () => {
        const cmd = makeCmd("leaf");
        const api = makeApi();

        const cliCommand: AnyCliCommand = {
            nodeType: "command",
            description: "Publish package",
            positionals: {},
            options: {
                token: {type: "string", description: "Token", required: true}
            },
            execute: async () => {
            }
        };

        addOptionsToCommand(cmd, cliCommand, api);

        expect(cmd.options).toEqual([
            {
                flags: "--token <token>",
                description: "Token",
                required: true,
                defaultValue: undefined
            }
        ]);
    });
});

describe("interpretCliModel", () => {
    test("returns the original root command accumulator", () => {
        const rootCmd = makeCmd("root");
        const api = makeApi();
        const observability = makeObservability();

        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Laoban CLI",
            children: {}
        };

        const config: CliModelInterpreterConfig<FakeCmd> = {
            api,
            addAction: jest.fn((cmd) => cmd)
        };

        const result = interpretCliModel(rootCmd, model, config, observability);

        expect(result).toBe(rootCmd);
    });

    test("sets root metadata including version when present", () => {
        const rootCmd = makeCmd("root");
        const api = makeApi();
        const observability = makeObservability();

        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Laoban CLI",
            version: "1.2.3",
            children: {}
        };

        const config: CliModelInterpreterConfig<FakeCmd> = {
            api,
            addAction: jest.fn((cmd) => cmd)
        };

        interpretCliModel(rootCmd, model, config, observability);

        expect(rootCmd.rootName).toBe("laoban");
        expect(rootCmd.rootDescription).toBe("Laoban CLI");
        expect(rootCmd.rootVersion).toBe("1.2.3");
    });

    test("does not set root version when absent", () => {
        const rootCmd = makeCmd("root");
        const api = makeApi();
        const observability = makeObservability();

        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Laoban CLI",
            children: {}
        };

        const config: CliModelInterpreterConfig<FakeCmd> = {
            api,
            addAction: jest.fn((cmd) => cmd)
        };

        interpretCliModel(rootCmd, model, config, observability);

        expect(rootCmd.rootName).toBe("laoban");
        expect(rootCmd.rootDescription).toBe("Laoban CLI");
        expect(rootCmd.rootVersion).toBeUndefined();
    });

    test("adds a top-level group", () => {
        const rootCmd = makeCmd("root");
        const api = makeApi();
        const observability = makeObservability();

        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Laoban CLI",
            children: {
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {}
                }
            }
        };

        const config: CliModelInterpreterConfig<FakeCmd> = {
            api,
            addAction: jest.fn((cmd) => cmd)
        };

        interpretCliModel(rootCmd, model, config, observability);

        expect(rootCmd.groups).toHaveLength(1);
        expect(rootCmd.groups[0].name).toBe("admin");
        expect(rootCmd.groups[0].description).toBe("Admin commands");
    });

    test("adds a leaf command with spec, options, and action", () => {
        const rootCmd = makeCmd("root");
        const api = makeApi();
        const observability = makeObservability();

        const buildCommand: AnyCliCommand = {
            nodeType: "command",
            description: "Build workspace",
            positionals: {
                target: {type: "string", description: "Target", required: true},
                files: {type: "string[]", description: "Files"}
            },
            options: {
                verbose: {type: "boolean", description: "Verbose", shortName: "v"}
            },
            execute: async () => {
            }
        };

        const addAction = jest.fn((cmd: FakeCmd, cliCommand: AnyCliCommand) => {
            cmd.actionFor = cliCommand;
            return cmd;
        });

        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Laoban CLI",
            children: {
                build: buildCommand
            }
        };

        const config: CliModelInterpreterConfig<FakeCmd> = {
            api,
            addAction
        };

        interpretCliModel(rootCmd, model, config, observability);

        expect(rootCmd.commands).toHaveLength(1);
        expect(rootCmd.commands[0].spec).toBe("build <target> [files...]");
        expect(rootCmd.commands[0].description).toBe("Build workspace");
        expect(rootCmd.commands[0].child.options).toEqual([
            {
                flags: "-v, --verbose",
                description: "Verbose",
                required: false,
                defaultValue: undefined
            }
        ]);
        expect(addAction).toHaveBeenCalledTimes(1);
        expect(addAction).toHaveBeenCalledWith(rootCmd.commands[0].child, buildCommand);
        expect(rootCmd.commands[0].child.actionFor).toBe(buildCommand);
    });

    test("walks nested groups and commands", () => {
        const rootCmd = makeCmd("root");
        const api = makeApi();
        const observability = makeObservability();

        const initCommand: AnyCliCommand = {
            nodeType: "command",
            description: "Initialise project",
            positionals: {},
            options: {},
            execute: async () => {
            }
        };

        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Laoban CLI",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build workspace",
                    positionals: {},
                    options: {},
                    execute: async () => {
                    }
                },
                project: {
                    nodeType: "group",
                    description: "Project commands",
                    children: {
                        init: initCommand
                    }
                }
            }
        };

        const config: CliModelInterpreterConfig<FakeCmd> = {
            api,
            addAction: jest.fn((cmd) => cmd)
        };

        interpretCliModel(rootCmd, model, config, observability);

        expect(rootCmd.commands.map(c => c.spec)).toEqual(["build"]);
        expect(rootCmd.groups.map(g => g.name)).toEqual(["project"]);

        const projectGroup = rootCmd.groups[0].child;
        expect(projectGroup.commands.map(c => c.spec)).toEqual(["init"]);
        expect(projectGroup.commands[0].description).toBe("Initialise project");
    });

    test("emits debug logging through observability", () => {
        const rootCmd = makeCmd("root");
        const api = makeApi();
        const observability = makeObservability();

        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Laoban CLI",
            children: {
                build: {
                    nodeType: "command",
                    description: "Build workspace",
                    positionals: {},
                    options: {},
                    execute: async () => {
                    }
                },
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {}
                }
            }
        };

        const config: CliModelInterpreterConfig<FakeCmd> = {
            api,
            addAction: jest.fn((cmd) => cmd)
        };

        interpretCliModel(rootCmd, model, config, observability);

        expect(observability.debug).toHaveBeenCalledWith(
            "cli:adapter",
            "debug",
            "Walking CLI model laoban"
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