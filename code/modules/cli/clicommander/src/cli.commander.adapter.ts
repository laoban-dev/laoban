import {Command as CommanderCommand} from "commander";
import type {AnyCliCommand, BasicCliContext, CliPositionalParameterDef} from "@laoban/clidsl";
import type {Observability} from "@laoban/observability";
import type {CommanderAdapterConfig} from "./cli.commander.add.model";
import {Errors, isErrors} from "@laoban/errors";

export interface MakeCommanderCliAdapterConfig<
    C extends BasicCliContext = BasicCliContext
> {
    observability: Observability;
    makeContext: () => C;
    onError?: (observability: Observability, e: Errors) => Promise<void>;
}

type RuntimePositionalDef = CliPositionalParameterDef<string | number | string[]>;

function runtimePositionals<C extends BasicCliContext>(
    cliCommand: AnyCliCommand<C>
): Array<[string, RuntimePositionalDef]> {
    return Object.entries(
        cliCommand.positionals as Record<string, RuntimePositionalDef>
    );
}

function argsAndCommanderFromActionArgs(args: unknown[]): {
    positionals: unknown[];
    commanderCommand: CommanderCommand;
} {
    const commanderCommand = args[args.length - 1] as CommanderCommand;
    const positionals = args.slice(0, -2);
    return {positionals, commanderCommand};
}

function mergeValuesFromCommander<C extends BasicCliContext>(
    cliCommand: AnyCliCommand<C>,
    actionArgs: unknown[]
): Record<string, unknown> {
    const {positionals, commanderCommand} = argsAndCommanderFromActionArgs(actionArgs);
    const options = commanderCommand.opts() as Record<string, unknown>;
    const values: Record<string, unknown> = {...options};

    const positionalDefs = runtimePositionals(cliCommand);

    positionalDefs.forEach(([name, field], index) => {
        if (field.type === "string[]") {
            values[name] = positionals.slice(index);
        } else {
            values[name] = positionals[index];
        }
    });

    return values;
}

export function makeCommanderCliAdapter<
    C extends BasicCliContext = BasicCliContext
>(
    config: MakeCommanderCliAdapterConfig<C>
): CommanderAdapterConfig<C> {
    return {
        observability: config.observability,
        addAction: (
            commanderCommand: CommanderCommand,
            cliCommand: AnyCliCommand<C>
        ): CommanderCommand =>
            commanderCommand.action(async (...args: unknown[]) => {
                const values = mergeValuesFromCommander(cliCommand, args);
                const context = config.makeContext();

                const result = await cliCommand.execute(values as any, context);
                if (isErrors(result)) await config.onError?.(config.observability, result)
            })
    };
}