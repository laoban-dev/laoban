import { Command } from "commander";
import type { Observability } from "@laoban/observability";
import { exampleCli } from "@laoban/clidsl";
import { addCliModelToCommander } from "./cli.commander.add.model";
import type { CliWalkerDebugContext } from "@laoban/clidsl";

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

function buildProgram() {
    const program = new Command();
    const observability = makeObservability();

    addCliModelToCommander(program, exampleCli, {
        observability,
        addAction: cmd => cmd.action(() => {})
    });

    return { program, observability };
}

function findCommand(root: Command, ...path: string[]): Command | undefined {
    let current: Command | undefined = root;
    for (const segment of path) {
        current = current.commands.find(c => c.name() === segment);
        if (!current) return undefined;
    }
    return current;
}

function optionFlags(command: Command): string[] {
    return command.options.map(o => o.flags);
}

describe("Commander smoke tests", () => {
    test("projects exampleCli structure into real Commander", () => {
        const { program } = buildProgram();

        expect(program.commands.map(c => c.name())).toEqual([
            "build",
            "project",
            "package"
        ]);

        expect(findCommand(program, "build")?.description()).toBe("Build one or more targets");
        expect(findCommand(program, "project")?.description()).toBe("Project commands");
        expect(findCommand(program, "package")?.description()).toBe("Package commands");

        expect(findCommand(program, "project")?.commands.map(c => c.name())).toEqual([
            "init"
        ]);

        expect(findCommand(program, "package")?.commands.map(c => c.name())).toEqual([
            "publish",
            "version"
        ]);
    });

    test("projects build command options into real Commander", () => {
        const { program } = buildProgram();
        const build = findCommand(program, "build");

        expect(build).toBeDefined();
        expect(optionFlags(build!)).toEqual([
            "-v, --verbose",
            "-r, --retries <retries>"
        ]);
    });

    test("projects publish command options into real Commander", () => {
        const { program } = buildProgram();
        const publish = findCommand(program, "package", "publish");

        expect(publish).toBeDefined();
        expect(optionFlags(publish!)).toEqual([
            "--registry <registry>",
            "-d, --dryRun",
            "--tag <tag...>"
        ]);
    });

    test("can parse build command arguments and options", () => {
        const { program } = buildProgram();

        program.parse(
            ["build", "target-a", "file1", "file2", "--verbose", "--retries", "3"],
            { from: "user" }
        );

        const build = findCommand(program, "build");
        expect(build).toBeDefined();

        expect(build!.args).toEqual(["target-a", "file1", "file2"]);
        expect(build!.opts()).toEqual({
            verbose: true,
            retries: "3"
        });
    });

    test("can parse nested publish command arguments and options", () => {
        const { program } = buildProgram();

        program.parse(
            [
                "package",
                "publish",
                "my-package",
                "--registry",
                "https://registry.example.com",
                "--tag",
                "alpha",
                "--tag",
                "beta",
                "--dryRun"
            ],
            { from: "user" }
        );

        const publish = findCommand(program, "package", "publish");
        expect(publish).toBeDefined();

        expect(publish!.args).toEqual(["my-package"]);
        expect(publish!.opts()).toEqual({
            registry: "https://registry.example.com",
            tag: ["alpha", "beta"],
            dryRun: true
        });
    });
});