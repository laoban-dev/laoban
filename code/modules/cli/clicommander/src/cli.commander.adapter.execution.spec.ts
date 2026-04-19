import { CliModel } from '@laoban/clidsl';
import { isErrors } from '@laoban/errors';
import { makeCommanderAdapterFixture } from './cli.commander.fixture';

describe('cli.commander.adapter execution', () => {
    it('should execute a top level command', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                update: fixture.makeLeafCommand(),
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['update']);

        expect(fixture.executeCalls).toEqual([
            {
                values: {},
                context: { root: '/tmp/ws' },
            },
        ]);
    });

    it('should execute a grouped command', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            groups: {
                admin: {
                    description: 'admin commands',
                    commands: {
                        repair: fixture.makeLeafCommand(),
                    },
                },
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['admin', 'repair']);

        expect(fixture.executeCalls).toEqual([
            {
                values: {},
                context: { root: '/tmp/ws' },
            },
        ]);
    });

    it('should parse string, boolean and number options', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                test: fixture.makeLeafCommand({
                    fields: {
                        since: { kind: 'optionString', description: 'git ref', shortName: 's' },
                        dryRun: { kind: 'optionBoolean', description: 'dry run', shortName: 'd' },
                        limit: { kind: 'optionNumber', description: 'limit' },
                    },
                }),
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['test', '--since', 'main', '--dry-run', '--limit', '3']);

        expect(fixture.executeCalls).toEqual([
            {
                values: {
                    since: 'main',
                    dryRun: true,
                    limit: 3,
                },
                context: { root: '/tmp/ws' },
            },
        ]);
    });

    it('should accumulate repeated option strings into string array', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                tags: fixture.makeLeafCommand({
                    fields: {
                        tag: { kind: 'optionStrings', description: 'tag' },
                    },
                }),
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['tags', '--tag', 'a', '--tag', 'b', '--tag', 'c']);

        expect(fixture.executeCalls).toEqual([
            {
                values: {
                    tag: ['a', 'b', 'c'],
                },
                context: { root: '/tmp/ws' },
            },
        ]);
    });

    it('should parse positional string and number values', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                one: fixture.makeLeafCommand({
                    fields: {
                        project: { kind: 'positionalString', description: 'project' },
                        count: { kind: 'positionalNumber', description: 'count' },
                    },
                }),
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['one', 'package-a', '42']);

        expect(fixture.executeCalls).toEqual([
            {
                values: {
                    project: 'package-a',
                    count: 42,
                },
                context: { root: '/tmp/ws' },
            },
        ]);
    });

    it('should parse variadic positional strings', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                many: fixture.makeLeafCommand({
                    fields: {
                        projects: { kind: 'positionalStrings', description: 'projects', variadic: true },
                    },
                }),
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['many', 'a', 'b', 'c']);

        expect(fixture.executeCalls).toEqual([
            {
                values: {
                    projects: ['a', 'b', 'c'],
                },
                context: { root: '/tmp/ws' },
            },
        ]);
    });

    it('should call onCompletion with success result', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                update: fixture.makeLeafCommand(),
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['update']);

        expect(fixture.completionCalls).toHaveLength(1);
        expect(fixture.completionCalls[0].commandPath).toEqual(['update']);
        expect(isErrors(fixture.completionCalls[0].result)).toBe(false);
    });

    it('should send thrown execute errors to onCompletion', async () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                broken: fixture.makeLeafCommand({
                    execute: async () => {
                        throw new Error('boom');
                    },
                }),
            },
        };

        const program = fixture.makeProgram(model);

        await fixture.parse(program, ['broken']);

        expect(fixture.completionCalls).toHaveLength(1);
        expect(fixture.completionCalls[0].commandPath).toEqual(['broken']);
        expect(isErrors(fixture.completionCalls[0].result)).toBe(true);
    });
});