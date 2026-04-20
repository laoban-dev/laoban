import {Command as CommanderCommand} from "commander";
import type {Observability} from "@laoban/observability";
import type {
    AnyCliCommand,
    BasicCliContext,
    CliRoot
} from "@laoban/clidsl";
import {
    interpretCliModel,
    type CliModelInterpreterConfig,
    type CommandBuilderApi
} from "@laoban/clidsl";

export interface CommanderAdapterConfig<C extends BasicCliContext = BasicCliContext> {
    observability: Observability;
    addAction: (
        commanderCommand: CommanderCommand,
        cliCommand: AnyCliCommand<C>
    ) => CommanderCommand;
}

export const commanderBuilderApi: CommandBuilderApi<CommanderCommand> = {
    setRootName: (cmd, name) => cmd.name(name),

    setRootDescription: (cmd, description) => cmd.description(description),

    setRootVersion: (cmd, version) => cmd.version(version),

    addGroup: (parent, name, description) =>
        parent.command(name).description(description),

    addCommand: (parent, commandSpec, description) =>
        parent.command(commandSpec).description(description),

    addOption: (cmd, flags, description, required, defaultValue) => {
        if (required) {
            return defaultValue !== undefined
                ? cmd.requiredOption(flags, description, defaultValue as any)
                : cmd.requiredOption(flags, description);
        }

        return defaultValue !== undefined
            ? cmd.option(flags, description, defaultValue as any)
            : cmd.option(flags, description);
    }
};

export function addCliModelToCommander<C extends BasicCliContext = BasicCliContext>(
    program: CommanderCommand,
    model: CliRoot<C>,
    config: CommanderAdapterConfig<C>
): CommanderCommand {
    const interpreterConfig: CliModelInterpreterConfig<CommanderCommand, C> = {
        api: commanderBuilderApi,
        addAction: config.addAction
    };

    return interpretCliModel(
        program,
        model,
        interpreterConfig,
        config.observability
    );
}