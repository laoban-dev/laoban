import type {CliRoot} from "@laoban/clidsl";
import {addCliModelToCommander} from "./cli.commander.add.model";
import {buildProgram, findCommand, makeObservability, optionFlags} from "./cli.commander.fixture";

describe("addCliModelToCommander structure", () => {
    test("returns the original program", () => {
        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Root CLI",
            children: {}
        };

        const program = buildProgram(model);
        const result = addCliModelToCommander(program, model, {
            observability: makeObservability(),
            addAction: cmd => cmd.action(() => {})
        });

        expect(result).toBe(program);
    });

    test("applies root metadata", () => {
        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Root CLI",
            version: "1.2.3",
            children: {}
        };

        const program = buildProgram(model);

        expect(program.name()).toBe("laoban");
        expect(program.description()).toBe("Root CLI");
        expect(program.version()).toBe("1.2.3");
    });

    test("creates a group using parent.command(name).description(group.description)", () => {
        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Root CLI",
            children: {
                admin: {
                    nodeType: "group",
                    description: "Admin commands",
                    children: {}
                }
            }
        };

        const program = buildProgram(model);
        const admin = findCommand(program, "admin");

        expect(admin).toBeDefined();
        expect(admin?.name()).toBe("admin");
        expect(admin?.description()).toBe("Admin commands");
    });

    test("creates a leaf command with positional signature, then adds options and action", () => {
        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Root CLI",
            children: {
                build: {
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
                }
            }
        };

        const program = buildProgram(model);
        const build = findCommand(program, "build");

        expect(build).toBeDefined();
        expect(build?.description()).toBe("Build workspace");
        expect(optionFlags(build!)).toContain("-v, --verbose");
    });

    test("adds optional and required options with default values", () => {
        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Root CLI",
            children: {
                publish: {
                    nodeType: "command",
                    description: "Publish package",
                    positionals: {},
                    options: {
                        registry: {type: "string", description: "Registry", defaultValue: "https://registry.npmjs.org"},
                        retries: {type: "number", description: "Retries", defaultValue: 3},
                        token: {type: "string", description: "Token", required: true},
                        tag: {type: "string[]", description: "Tags"}
                    },
                    execute: async () => {
                    }
                }
            }
        };

        const program = buildProgram(model);
        const publish = findCommand(program, "publish");

        expect(publish).toBeDefined();
        expect(optionFlags(publish!)).toEqual(
            expect.arrayContaining([
                "--registry <registry>",
                "--retries <retries>",
                "--token <token>",
                "--tag <tag...>"
            ])
        );
    });

    test("walks nested groups and leaf commands", () => {
        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Root CLI",
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
                        init: {
                            nodeType: "command",
                            description: "Initialise project",
                            positionals: {},
                            options: {},
                            execute: async () => {
                            }
                        }
                    }
                }
            }
        };

        const program = buildProgram(model);

        const build = findCommand(program, "build");
        const project = findCommand(program, "project");
        const init = findCommand(program, "project", "init");

        expect(build?.description()).toBe("Build workspace");
        expect(project?.description()).toBe("Project commands");
        expect(init?.description()).toBe("Initialise project");
    });

    test("creates the expected top-level commands", () => {
        const model: CliRoot = {
            nodeType: "root",
            name: "laoban",
            description: "Root CLI",
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
                        init: {
                            nodeType: "command",
                            description: "Initialise project",
                            positionals: {},
                            options: {},
                            execute: async () => {
                            }
                        }
                    }
                }
            }
        };

        const program = buildProgram(model);

        expect(program.commands.map(c => c.name())).toEqual(["build", "project"]);
    });
});