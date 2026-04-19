import { CliModel } from '@laoban/clidsl';
import { makeCommanderAdapterFixture } from './cli.commander.fixture';

describe('cli.commander.adapter structure', () => {
    it('should add a top level command to the program', () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                update: fixture.makeLeafCommand({
                    description: 'update workspace',
                }),
            },
        };

        const program = fixture.makeProgram(model);
        const update = program.commands.find(c => c.name() === 'update');

        expect(update).toBeDefined();
        expect(update?.description()).toBe('update workspace');
    });

    it('should add nested group commands', () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            groups: {
                admin: {
                    description: 'admin commands',
                    commands: {
                        repair: fixture.makeLeafCommand({
                            description: 'repair logs',
                        }),
                    },
                },
            },
        };

        const program = fixture.makeProgram(model);
        const admin = program.commands.find(c => c.name() === 'admin');
        const repair = admin?.commands.find(c => c.name() === 'repair');

        expect(admin).toBeDefined();
        expect(admin?.description()).toBe('admin commands');
        expect(repair).toBeDefined();
        expect(repair?.description()).toBe('repair logs');
    });

    it('should attach command options and arguments', () => {
        const fixture = makeCommanderAdapterFixture({ root: '/tmp/ws' });

        const model: CliModel<{ root: string }> = {
            description: 'test cli',
            commands: {
                test: fixture.makeLeafCommand({
                    fields: {
                        since: { kind: 'optionString', description: 'git ref', shortName: 's' },
                        dryRun: { kind: 'optionBoolean', description: 'dry run', shortName: 'd' },
                        projects: { kind: 'positionalStrings', description: 'projects', variadic: true },
                    },
                }),
            },
        };

        const program = fixture.makeProgram(model);
        const testCommand = program.commands.find(c => c.name() === 'test');

        expect(testCommand).toBeDefined();
        expect(testCommand?.options.map(o => o.flags)).toEqual(
            expect.arrayContaining(['-s, --since <value>', '-d, --dry-run'])
        );
        expect(testCommand?.registeredArguments.map(a => a.required ? `<${a.name()}>` : `[${a.name()}]`)).toHaveLength(1);
    });
});