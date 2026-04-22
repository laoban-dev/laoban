import {Command} from "commander";
import type {ModuleName, Observability} from "@laoban/observability";
import {addCliModelToCommander} from "./cli.commander.add.model";

export function makeObservability(module: ModuleName = undefined): Observability {
    const logger = jest.fn();
    const debug = jest.fn();
    const countMetric = jest.fn();
    const durationMetric = jest.fn();

    const build = (module: ModuleName): Observability => ({
        correlationId: "test-correlation-id",
        module,
        logger,
        debug,
        countMetric,
        durationMetric,
        debugLevels: {},
        timeService: { now: () => 0 },
        withModule: build
    });

    return build(module);
}

export function buildProgram(model: any) {
    const program = new Command();
    addCliModelToCommander(program, model, {
        observability: makeObservability(),
        addAction: cmd => cmd.action(() => {})
    });
    return program;
}

export function findCommand(root: Command, ...path: string[]): Command | undefined {
    let current: Command | undefined = root;
    for (const segment of path) {
        current = current.commands.find(c => c.name() === segment);
        if (!current) return undefined;
    }
    return current;
}

export function optionFlags(command: Command): string[] {
    return command.options.map(o => o.flags);
}