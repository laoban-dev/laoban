import { Command as CommanderCommand } from "commander";
import type { Observability } from "@laoban/observability";
import type {
    AnyCliCommand,
    BasicCliContext,
    CliGroup,
    CliOptionParameterDef,
    CliPositionalParameterDef
} from "@laoban/clidsl";
import { type CliWalkerConfig, type CliWalkerDebugContext, walkCliModel } from "@laoban/clidsl";

export interface CommanderAdapterConfig<C extends BasicCliContext = BasicCliContext> {
    observability: Observability<CliWalkerDebugContext>;
    addAction: (
        commanderCommand: CommanderCommand,
        cliCommand: AnyCliCommand<C>
    ) => CommanderCommand;
}

type RuntimePositionalDef = CliPositionalParameterDef<string | number | string[]>;
type RuntimeOptionDef = CliOptionParameterDef<string | number | boolean | string[]>;

function positionalToken(name: string, field: RuntimePositionalDef): string {
    switch (field.type) {
        case "string":
        case "number":
            return field.required ? `<${name}>` : `[${name}]`;
        case "string[]":
            return field.required ? `<${name}...>` : `[${name}...]`;
    }
}

function optionFlags(name: string, field: RuntimeOptionDef): string {
    const longName = `--${name}`;
    const shortPrefix = field.shortName ? `-${field.shortName}, ` : "";

    switch (field.type) {
        case "boolean":
            return `${shortPrefix}${longName}`;
        case "string":
        case "number":
            return `${shortPrefix}${longName} <${name}>`;
        case "string[]":
            return `${shortPrefix}${longName} <${name}...>`;
    }
}

export function createLeafCommand<C extends BasicCliContext = BasicCliContext>(
    parent: CommanderCommand,
    name: string,
    cliCommand: AnyCliCommand<C>
): CommanderCommand {
    const positionals = cliCommand.positionals as Record<string, RuntimePositionalDef>;

    const positionalSignature = Object.entries(positionals)
        .map(([paramName, field]) => positionalToken(paramName, field))
        .join(" ");

    const spec = positionalSignature.length === 0
        ? name
        : `${name} ${positionalSignature}`;

    return parent
        .command(spec)
        .description(cliCommand.description);
}

export function addOptions<C extends BasicCliContext = BasicCliContext>(
    commanderCommand: CommanderCommand,
    cliCommand: AnyCliCommand<C>
): CommanderCommand {
    const options = cliCommand.options as Record<string, RuntimeOptionDef>;

    for (const [name, field] of Object.entries(options)) {
        const flags = optionFlags(name, field);

        if (field.required) {
            if (field.defaultValue !== undefined) {
                commanderCommand.requiredOption(flags, field.description, field.defaultValue as any);
            } else {
                commanderCommand.requiredOption(flags, field.description);
            }
        } else {
            if (field.defaultValue !== undefined) {
                commanderCommand.option(flags, field.description, field.defaultValue as any);
            } else {
                commanderCommand.option(flags, field.description);
            }
        }
    }

    return commanderCommand;
}

export function addCliModelToCommander<C extends BasicCliContext = BasicCliContext>(
    program: CommanderCommand,
    model: CliGroup<C>,
    config: CommanderAdapterConfig<C>
): CommanderCommand {
    const walkerConfig: CliWalkerConfig<CommanderCommand, C> = {
        observability: config.observability,
        addGroup: (parent, name, group) =>
            parent.command(name).description(group.description),
        addLeafCommand: (parent, name, cliCommand) => {
            const commanderCommand = createLeafCommand(parent, name, cliCommand);
            addOptions(commanderCommand, cliCommand);
            config.addAction(commanderCommand, cliCommand);
            return commanderCommand;
        }
    };

    return walkCliModel(program, model, walkerConfig);
}