import {Command, Option} from 'commander';
import {BaseIssue, ErrorsOr, isErrors, makeErrorFromException, value} from '@laoban/errors';
import {Observability} from '@laoban/observability';

import {
    CliCommand,
    CliFields,
    CliGroup,
    CliModel,
    CliOptionFieldDef,
    CliPositionalFieldDef,
    CliRecord,
    isCliOptionBooleanFieldDef,
    isCliOptionFieldDef,
    isCliOptionNumberFieldDef,
    isCliOptionStringFieldDef,
    isCliOptionStringsFieldDef,
    isCliPositionalFieldDef,
    isCliPositionalNumberFieldDef,
    isCliPositionalStringFieldDef,
    isCliPositionalStringsFieldDef,
    SomeCliCommand,
} from '@laoban/clidsl';
import {safeJson} from "@laoban/safe";
import {toKebabCase} from "@laoban/strings";

export type CommanderAdapterIssue<DebugContext extends string> =
    BaseIssue<'cli.commander', {
        commandPath: string[];
        correlationId: string;
        debugContext: DebugContext;
        details?: unknown;
    }> & {
    kind: 'cli.commander';
};

export interface CommanderCliAdapterParams<Ctx, DebugContext extends string> {
    programName: string;
    model: CliModel<Ctx>;
    observability: Observability<DebugContext>;
    debugContext: DebugContext;

    makeContext?: (args: {
        commandPath: string[];
        observability: Observability<DebugContext>;
    }) => Promise<ErrorsOr<Ctx, CommanderAdapterIssue<DebugContext>>>;
    onCompletion?: (args: {
        commandPath: string[];
        observability: Observability<DebugContext>;
        result: ErrorsOr<void>;
    }) => Promise<number | void>;

}

type AdapterServices<Ctx, DebugContext extends string> = {
    observability: Observability<DebugContext>;
    debugContext: DebugContext;
    makeContext?: (args: {
        commandPath: string[];
        observability: Observability<DebugContext>;
    }) => Promise<ErrorsOr<Ctx, CommanderAdapterIssue<DebugContext>>>;
    onCompletion?: (args: {
        commandPath: string[];
        observability: Observability<DebugContext>;
        result: ErrorsOr<void>;
    }) => Promise<number | void>;
};

export function makeCommanderCliAdapter<Ctx, DebugContext extends string>(
    params: CommanderCliAdapterParams<Ctx, DebugContext>
): Command {
    const program = new Command();
    program.name(params.programName);
    program.description(params.model.description);

    const services: AdapterServices<Ctx, DebugContext> = {
        observability: params.observability,
        debugContext: params.debugContext,
        makeContext: params.makeContext,
        onCompletion: params.onCompletion,
    };

    addGroupContents(program, params.model, services, []);
    return program;
}

function addGroupContents<Ctx, DebugContext extends string>(
    parent: Command,
    group: CliGroup<Ctx>,
    services: AdapterServices<Ctx, DebugContext>,
    path: string[]
): void {
    Object.entries(group.commands ?? {}).forEach(([name, command]) => {
        addCommand(parent, name, command, services, [...path, name]);
    });

    Object.entries(group.groups ?? {}).forEach(([name, childGroup]) => {
        const child = new Command(name);
        child.description(childGroup.description);
        parent.addCommand(child);
        addGroupContents(child, childGroup, services, [...path, name]);
    });
}

function addCommand<Ctx, DebugContext extends string>(
    parent: Command,
    name: string,
    cliCommand: SomeCliCommand<Ctx>,
    services: AdapterServices<Ctx, DebugContext>,
    commandPath: string[]
): void {
    const cmd = new Command(name);
    cmd.description(cliCommand.description);

    applyFieldDefinitions(cmd, cliCommand.fields);

    cmd.action(async (...args: any[]) => {
        const { positionals, options } = splitCommanderActionArgs(args);
        const exitCode = await invokeCliCommand(
            cliCommand,
            commandPath,
            positionals,
            options,
            services
        );
        if (typeof exitCode === 'number' && exitCode !== 0) {
            process.exitCode = exitCode;
        }
    });

    parent.addCommand(cmd);
}

function applyFieldDefinitions(
    command: Command,
    fields: CliFields<CliRecord>
): void {
    for (const [fieldName, fieldDef] of Object.entries(fields)) {
        if (isCliPositionalFieldDef(fieldDef)) {
            command.argument(toCommanderArgument(fieldName, fieldDef), fieldDef.description);
        } else {
            command.addOption(toCommanderOption(fieldName, fieldDef));
        }
    }
}

function toCommanderArgument(fieldName: string, fieldDef: CliPositionalFieldDef): string {
    const required = fieldDef.required ?? false;

    if (isCliPositionalStringFieldDef(fieldDef)) {
        return required ? `<${fieldName}>` : `[${fieldName}]`;
    }

    if (isCliPositionalNumberFieldDef(fieldDef)) {
        return required ? `<${fieldName}>` : `[${fieldName}]`;
    }

    if (isCliPositionalStringsFieldDef(fieldDef)) {
        const suffix = fieldDef.variadic ? '...' : '';
        return required ? `<${fieldName}${suffix}>` : `[${fieldName}${suffix}]`;
    }

    return required ? `<${fieldName}>` : `[${fieldName}]`;
}

function toCommanderOption(fieldName: string, fieldDef: CliOptionFieldDef): Option {
    const shortPrefix = fieldDef.shortName ? `-${fieldDef.shortName}, ` : '';
    const longName = `--${toKebabCase(fieldName)}`;

    if (isCliOptionBooleanFieldDef(fieldDef)) {
        const option = new Option(`${shortPrefix}${longName}`, fieldDef.description);
        option.makeOptionMandatory(!!fieldDef.required);
        return option;
    }

    if (isCliOptionStringFieldDef(fieldDef)) {
        const option = new Option(`${shortPrefix}${longName} <value>`, fieldDef.description);
        option.makeOptionMandatory(!!fieldDef.required);
        return option;
    }

    if (isCliOptionNumberFieldDef(fieldDef)) {
        const option = new Option(`${shortPrefix}${longName} <value>`, fieldDef.description)
            .argParser((v: string) => Number(v));
        option.makeOptionMandatory(!!fieldDef.required);
        return option;
    }

    if (isCliOptionStringsFieldDef(fieldDef)) {
        const option = new Option(`${shortPrefix}${longName} <value>`, fieldDef.description)
            .argParser((v: string, previous: string[] = []) => [...previous, v]);
        option.makeOptionMandatory(!!fieldDef.required);
        return option;
    }
    throw new Error( `Unexpected value for field name ${fieldName}: ${safeJson(fieldDef)}`);

}
function splitCommanderActionArgs(args: any[]): {
    positionals: unknown[];
    options: Record<string, unknown>;
} {
    const last = args[args.length - 1];
    const command = last && typeof last.opts === 'function' ? last as Command : undefined;

    return {
        positionals: command ? args.slice(0, -1) : args,
        options: command ? command.opts() : {},
    };
}

function extractCliValues(
    fields: CliFields<CliRecord>,
    rawPositionals: unknown[],
    rawOptions: Record<string, unknown>
): CliRecord {
    const result: CliRecord = {};
    const positionalEntries = Object.entries(fields).filter(([, def]) => isCliPositionalFieldDef(def));

    for (let index = 0; index < positionalEntries.length; index++) {
        const [fieldName, fieldDef] = positionalEntries[index];
        const raw = rawPositionals[index];

        if (isCliPositionalStringFieldDef(fieldDef)) {
            result[fieldName] = raw === undefined ? '' : String(raw);
            continue;
        }

        if (isCliPositionalNumberFieldDef(fieldDef)) {
            result[fieldName] = raw === undefined ? Number.NaN : Number(raw);
            continue;
        }

        if (isCliPositionalStringsFieldDef(fieldDef)) {
            if (fieldDef.variadic) {
                const variadicRaw = rawPositionals[index];

                if (Array.isArray(variadicRaw)) {
                    result[fieldName] = variadicRaw.map(String);
                } else if (variadicRaw === undefined) {
                    result[fieldName] = [];
                } else {
                    result[fieldName] = rawPositionals.slice(index).map(String);
                }
            } else {
                result[fieldName] = raw === undefined ? [] : [String(raw)];
            }
        }
    }

    Object.entries(fields).forEach(([fieldName, fieldDef]) => {
        if (!isCliOptionFieldDef(fieldDef)) return;

        const optionKey = toCommanderOptionKey(fieldName);
        const raw = rawOptions[optionKey];

        if (isCliOptionBooleanFieldDef(fieldDef)) {
            result[fieldName] = Boolean(raw);
            return;
        }

        if (isCliOptionStringFieldDef(fieldDef)) {
            result[fieldName] = raw === undefined ? '' : String(raw);
            return;
        }

        if (isCliOptionNumberFieldDef(fieldDef)) {
            result[fieldName] = raw === undefined ? Number.NaN : Number(raw);
            return;
        }

        if (isCliOptionStringsFieldDef(fieldDef)) {
            result[fieldName] = Array.isArray(raw) ? raw.map(String) : raw === undefined ? [] : [String(raw)];
        }
    });

    return result;
}

async function invokeCliCommand<Ctx, DebugContext extends string>(
    cliCommand: CliCommand<CliRecord, Ctx>,
    commandPath: string[],
    rawPositionals: unknown[],
    rawOptions: Record<string, unknown>,
    services: AdapterServices<Ctx, DebugContext>
): Promise<number | void> {
    const { observability, debugContext, makeContext, onCompletion } = services;
    const started = observability.timeService.now();
    const metricBase = `cli.command.${commandPath.join('.')}`;

    observability.countMetric('cli.command.invoked');
    observability.countMetric(`${metricBase}.invoked`);
    observability.debug(debugContext, 'debug', 'cli.command.invoked', {
        commandPath,
        rawPositionals,
        rawOptions,
    });

    try {
        const values = extractCliValues(cliCommand.fields, rawPositionals, rawOptions);

        observability.debug(debugContext, 'debug', 'cli.command.values', {
            commandPath,
            values,
        });

        const contextResult = makeContext
            ? await makeContext({ commandPath, observability })
            : value(undefined as Ctx);

        if (isErrors(contextResult)) {
            const duration = observability.timeService.now() - started;
            observability.countMetric('cli.command.contextFailed');
            observability.countMetric(`${metricBase}.contextFailed`);
            observability.durationMetric('cli.command.duration', duration);
            observability.durationMetric(`${metricBase}.duration`, duration);

            return onCompletion?.({
                commandPath,
                observability,
                result: contextResult,
            });
        }

        await cliCommand.execute(values, contextResult.value);

        const duration = observability.timeService.now() - started;
        observability.countMetric('cli.command.succeeded');
        observability.countMetric(`${metricBase}.succeeded`);
        observability.durationMetric('cli.command.duration', duration);
        observability.durationMetric(`${metricBase}.duration`, duration);

        return onCompletion?.({
            commandPath,
            observability,
            result: value(undefined),
        });
    } catch (e) {
        const duration = observability.timeService.now() - started;
        observability.countMetric('cli.command.failed');
        observability.countMetric(`${metricBase}.failed`);
        observability.durationMetric('cli.command.duration', duration);
        observability.durationMetric(`${metricBase}.duration`, duration);

        const errorResult = makeErrorFromException(e, {
            kind: 'cli.commander',
            message: `Failed to execute command ${commandPath.join(' ')}`,
            context: {
                commandPath,
                correlationId: observability.correlationId,
                debugContext,
            },
        });

        observability.debug(debugContext, 'error', 'cli.command.failed', {
            commandPath,
            errorResult,
        });

        return onCompletion?.({
            commandPath,
            observability,
            result: errorResult,
        });
    }
}


function toCommanderOptionKey(fieldName: string): string {
    return fieldName;
}