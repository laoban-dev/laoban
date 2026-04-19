import {Command} from 'commander';
import {BaseIssue, ErrorsOr, value} from '@laoban/errors';
import {Observability, recordingObservability} from '@laoban/observability';
import {CliCommand, CliModel, CliRecord} from '@laoban/clidsl';
import {CommanderAdapterIssue, makeCommanderCliAdapter} from './cli.commander.adapter';

export type TestDebugContext = 'cli';
type TestObservability = Observability<TestDebugContext>;

export interface ExecuteCall<Ctx = unknown> {
    values: CliRecord;
    context: Ctx;
}

export interface CompletionCall {
    commandPath: string[];
    result: ErrorsOr<void, BaseIssue>;
}

export interface CommanderAdapterFixture<Ctx> {
    observability: TestObservability;
    executeCalls: ExecuteCall<Ctx>[];
    completionCalls: CompletionCall[];
    makeProgram: (model: CliModel<Ctx>) => Command;
    parse: (program: Command, argv: string[]) => Promise<void>;
    makeLeafCommand: (command?: Partial<CliCommand<CliRecord, Ctx>>) => CliCommand<CliRecord, Ctx>;
}

export function makeCommanderAdapterFixture<Ctx>(context: Ctx): CommanderAdapterFixture<Ctx> {
    const executeCalls: ExecuteCall<Ctx>[] = [];
    const completionCalls: CompletionCall[] = [];

    const recording = recordingObservability<TestDebugContext>(
        {cli: ['debug']},
        'test-correlation-id'
    );

    const observability = recording.observability;

    async function makeContext(): Promise<ErrorsOr<Ctx, CommanderAdapterIssue<TestDebugContext>>> {
        return value(context);
    }

    async function onCompletion(args: {
        commandPath: string[];
        result: ErrorsOr<void, BaseIssue>;
    }): Promise<number | void> {
        completionCalls.push({
            commandPath: args.commandPath,
            result: args.result,
        });
        return 0;
    }

    function makeProgram(model: CliModel<Ctx>): Command {
        return makeCommanderCliAdapter({
            programName: 'laoban',
            model,
            observability,
            debugContext: 'cli',
            makeContext,
            onCompletion,
        });
    }

    async function parse(program: Command, argv: string[]): Promise<void> {
        await program.parseAsync(argv, {from: 'user'});
    }

    function makeLeafCommand(
        command: Partial<CliCommand<CliRecord, Ctx>> = {}
    ): CliCommand<CliRecord, Ctx> {
        return {
            description: command.description ?? 'test command',
            fields: command.fields ?? {},
            execute: command.execute ?? (async (values, ctx) => {
                executeCalls.push({values, context: ctx});
            }),
        };
    }

    return {
        observability,
        executeCalls,
        completionCalls,
        makeProgram,
        parse,
        makeLeafCommand,
    };
}