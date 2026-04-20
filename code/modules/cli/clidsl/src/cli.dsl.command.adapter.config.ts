import {mapEntries} from "@laoban/records";
import type {
    AnyCliCommand,
    BasicCliContext,
    CliOptionParameterDef,
    CliPositionalParameterDef,
    CliPositionalValue,
    CliRoot,
    CliValue
} from "./cli.dsl";
import {type CliWalkerConfig, walkCliModel} from "./cli.dsl.walker";
import {Observability} from "@laoban/observability";

export interface CommandBuilderApi<Cmd> {
    setRootName(cmd: Cmd, name: string): Cmd;

    setRootDescription(cmd: Cmd, description: string): Cmd;

    setRootVersion(cmd: Cmd, version: string): Cmd;

    addGroup(parent: Cmd, name: string, description: string): Cmd;

    addCommand(parent: Cmd, commandSpec: string, description: string): Cmd;

    addOption(
        cmd: Cmd,
        flags: string,
        description: string,
        required: boolean,
        defaultValue?: unknown
    ): Cmd;
}

export interface CliModelInterpreterConfig<
    Cmd,
    C extends BasicCliContext = BasicCliContext
> {
    api: CommandBuilderApi<Cmd>;
    addAction: (
        cmd: Cmd,
        cliCommand: AnyCliCommand<C>
    ) => Cmd;
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

export function createLeafCommandSpec<C extends BasicCliContext = BasicCliContext>(
    name: string,
    cliCommand: AnyCliCommand<C>
): string {
    const positionalSignature = mapEntries(
        asPositionals(cliCommand.positionals),
        (field, paramName) => positionalToken(paramName, field)
    ).join(" ");

    return positionalSignature.length === 0
        ? name
        : `${name} ${positionalSignature}`;
}

export function addOptionsToCommand<Cmd, C extends BasicCliContext = BasicCliContext>(
    cmd: Cmd,
    cliCommand: AnyCliCommand<C>,
    api: CommandBuilderApi<Cmd>
): Cmd {
    let result = cmd;

    mapEntries(asOptions(cliCommand.options), (field, name) => {
        result = api.addOption(
            result,
            optionFlags(name, field),
            field.description,
            field.required === true,
            field.defaultValue
        );
        return undefined;
    });

    return result;
}

export function interpretCliModel<Cmd, C extends BasicCliContext = BasicCliContext>(
    rootCmd: Cmd,
    model: CliRoot<C>,
    config: CliModelInterpreterConfig<Cmd, C>,
    observability: Observability
): Cmd {
    const walkerConfig: CliWalkerConfig<Cmd, C> = {
        observability,
        addRoot: (acc, root) => {
            let result = config.api.setRootName(acc, root.name);
            result = config.api.setRootDescription(result, root.description);
            if (root.version !== undefined) {
                result = config.api.setRootVersion(result, root.version);
            }
            return result;
        },
        addGroup: (parent, name, group) =>
            config.api.addGroup(parent, name, group.description),
        addLeafCommand: (parent, name, cliCommand) => {
            const commandSpec = createLeafCommandSpec(name, cliCommand);
            let child = config.api.addCommand(parent, commandSpec, cliCommand.description);
            child = addOptionsToCommand(child, cliCommand, config.api);
            return config.addAction(child, cliCommand);
        }
    };

    return walkCliModel(rootCmd, model, walkerConfig);
}