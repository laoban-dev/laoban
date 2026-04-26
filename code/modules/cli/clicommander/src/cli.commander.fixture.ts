import {Command} from "commander";
import {
    defaultObservabilityContext,
    makeObservability,
    ModuleName,
    Observability,
} from "@laoban/observability";
import {addCliModelToCommander} from "./cli.commander.add.model";

export function makeTestObservability(module: ModuleName = undefined): Observability {
    const log = jest.fn();
    const debug = jest.fn();
    const countMetric = jest.fn();
    const durationMetric = jest.fn();

    return makeObservability({
        context: {
            ...defaultObservabilityContext("test-correlation-id", {}, module),
            timeService: {now: () => 0},
        },
        target: {
            write: log,
        },
        countMetric,
        durationMetric,
    });
}

export function buildProgram(model: any) {
    const program = new Command();

    addCliModelToCommander(program, model, {
        observability: makeTestObservability(),
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