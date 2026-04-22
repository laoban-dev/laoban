import { LaobanScript, LaobanScripts } from "@laoban/scripts";
import {
    makeScriptCommand,
    makeScriptCommands,
    ScriptCommandValues,
    scriptCommandOptions,
    LaobanScriptCliContext
} from "./scripts.cli";

function makeObservability() {
    return {
        logger: jest.fn(),
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
        timeService: {
            now: jest.fn(() => 1000)
        }
    } as any;
}

function makeScript(description: string): LaobanScript {
    return {
        description,
        commands: [],
        commandArgs: {}
    } as LaobanScript;
}

function makeValues(): ScriptCommandValues {
    return {
        dryrun: true,
        shellDebug: false,
        quiet: true,
        variables: false,
        one: true,
        all: false,
        packages: "alpha|beta",
        generationPlan: true,
        throttle: "3",
        links: true,
        debug: "session scripts",
        sessionId: "session-123",
        ignoreGuards: true
    };
}

function makeContext(): LaobanScriptCliContext {
    return {
        observability: makeObservability(),
        handleLaobanScript: jest.fn(async () => ({}))
    };
}

describe("makeScriptCommand", () => {
    it("creates a command with the script description, empty positionals and shared options", () => {
        const script = makeScript("Build stuff");

        const command = makeScriptCommand("build" as any, script);

        expect(command.nodeType).toBe("command");
        expect(command.description).toBe("Build stuff");
        expect(command.positionals).toEqual({});
        expect(command.options).toBe(scriptCommandOptions);
    });

    it("forwards execution to handleLaobanScript", async () => {
        const script = makeScript("Build stuff");
        const values = makeValues();
        const context = makeContext();

        const command = makeScriptCommand("build" as any, script);

        await command.execute(values, context);

        expect(context.handleLaobanScript).toHaveBeenCalledTimes(1);
        expect(context.handleLaobanScript).toHaveBeenCalledWith("build", script, values, context);
    });
});

describe("makeScriptCommands", () => {
    it("creates commands keyed by script name", () => {
        const build = makeScript("Build stuff");
        const test = makeScript("Run tests");

        const commands = makeScriptCommands({
            build,
            test
        } as LaobanScripts);

        expect(Object.keys(commands)).toEqual(["build", "test"]);
        expect(commands.build.description).toBe("Build stuff");
        expect(commands.test.description).toBe("Run tests");
        expect(commands.build.positionals).toEqual({});
        expect(commands.test.positionals).toEqual({});
        expect(commands.build.options).toBe(scriptCommandOptions);
        expect(commands.test.options).toBe(scriptCommandOptions);
    });

    it("each generated command forwards the matching script name and script", async () => {
        const build = makeScript("Build stuff");
        const test = makeScript("Run tests");
        const values = makeValues();
        const context = makeContext();

        const commands = makeScriptCommands({
            build,
            test
        } as LaobanScripts);

        await commands.build.execute(values, context);
        await commands.test.execute(values, context);

        expect(context.handleLaobanScript).toHaveBeenNthCalledWith(1, "build", build, values, context);
        expect(context.handleLaobanScript).toHaveBeenNthCalledWith(2, "test", test, values, context);
    });
});