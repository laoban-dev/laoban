import { Command as CommanderCommand } from "commander";
import { mapEntries } from "@laoban/records";
import type { Observability } from "@laoban/observability";
import type {
    AnyCliCommand,
    BasicCliContext,
    CliGroup,
    CliOptionParameterDef,
    CliPositionalParameterDef,
    CliPositionalValue,
    CliValue
} from "./cli.dsl";
import {
    type CliWalkerConfig,
    type CliWalkerDebugContext,
    walkCliModel
} from "./cli.dsl.walker";

export interface CommanderAdapterConfig<C extends BasicCliContext = BasicCliContext> {
    observability: Observability<CliWalkerDebugContext>;
    addAction: (
        commanderCommand: CommanderCommand,
        cliCommand: AnyCliCommand<C>
    ) => CommanderCommand;
}

function asPositionals(
    positionals: AnyCliCommand["positionals"]
): Record<string, CliPositionalParameterDef<CliPositionalValue>> {
    return positionals as Record<string, CliPositionalParameterDef<CliPositionalValue>>;
}

function asOptions(
    options: AnyCliCommand["options"]
): Record<string, CliOptionParameterDef<CliValue>> {
    return options as Record<string, CliOptionParameterDef<CliValue>>;
}

function positionalToken(
    name: string,
    field: CliPositionalParameterDef<CliPositionalValue>
): string {
    switch (field.type) {
        case "string":
        case "number":
            return field.required ? `<${name}>` : `[${name}]`;
        case "string[]":
            return field.required ? `<${name}...>` : `[${name}...]`;
    }
}

function optionFlags(
    name: string,
    field: CliOptionParameterDef<CliValue>
): string {
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
    const positionalSignature = mapEntries(
        asPositionals(cliCommand.positionals),
        (field, paramName) => positionalToken(paramName, field)
    ).join(" ");

    const commandSpec = positionalSignature.length === 0
        ? name
        : `${name} ${positionalSignature}`;

    return parent
        .command(commandSpec)
        .description(cliCommand.description);
}

export function addOptions<C extends BasicCliContext = BasicCliContext>(
    commanderCommand: CommanderCommand,
    cliCommand: AnyCliCommand<C>
): CommanderCommand {
    mapEntries(asOptions(cliCommand.options), (field, name) => {
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

        return undefined;
    });

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