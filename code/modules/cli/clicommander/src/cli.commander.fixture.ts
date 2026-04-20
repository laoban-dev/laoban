import { Command } from "commander";
import type { Observability } from "@laoban/observability";
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

function buildProgram(model: any) {
    const program = new Command();
    addCliModelToCommander(program, model, {
        observability: makeObservability(),
        addAction: cmd => cmd.action(() => {})
    });
    return program;
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