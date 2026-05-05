import {AnyCliCommand, CliGroup, CliRoot, makeValidateCliModel, root} from "@laoban/clidsl";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {laobanConfigCommands} from "@laoban/config_cli";
import {ErrorsOr, isErrors, value} from "@laoban/errors";
import {dumpErrors} from "@laoban/observability";
import {laobanPackageCommands} from "@laoban/package_cli";
import {makeScriptCommands} from "@laoban/scripts_cli";
import {laobanUpdateCommand} from "@laoban/update_cli";

import {LaobanCliContext} from "./laoban.context";
import {LaobanDi} from "./laoban.di";

export type LaobanCliChild =
    CliGroup<LaobanCliContext> |
    AnyCliCommand<LaobanCliContext>;

export const builtInCliCommands: Record<string, LaobanCliChild> = {
    config: laobanConfigCommands,
    packages: laobanPackageCommands,
    update: laobanUpdateCommand
};

export function makeCliRoot(commands: Record<string, LaobanCliChild>): CliRoot<LaobanCliContext> {
    return root(
        "laoban",
        "a monorepo management tool",
        commands,
        "1.0.0"
    );
}

export function firstCommandToken(argv: string[]): string | undefined {
    const token = argv[2];
    return token && !token.startsWith("-") ? token : undefined;
}

export function isBuiltInTopLevelCommand(
    commands: Record<string, LaobanCliChild>,
    argv: string[]
): boolean {
    const commandName = firstCommandToken(argv);

    return commandName !== undefined &&
        Object.prototype.hasOwnProperty.call(commands, commandName);
}

export async function makeLaobanCliModel(di: LaobanDi): Promise<ErrorsOr<CliRoot<LaobanCliContext>>> {
    const builtInCliModel = makeCliRoot(builtInCliCommands);

    if (isBuiltInTopLevelCommand(builtInCliCommands, di.argv)) {
        return value(builtInCliModel);
    }

    const context = di.makeContext();

    const loadedConfig = await di.loadLaobanConfig(
        {
            osOps: context.osOps,
            fileOps: context.fileOps,
            observability: context.observability,
            markerFileName: "laoban.json",
            loadTextConfig: context.loadLaobanFileConfig
        },
        context.cwd
    );

    if (isErrors(loadedConfig)) {
        return loadedConfig;
    }

    const scriptCommands = makeScriptCommands(
        loadedConfig.value.config.scripts ?? {}
    ) as Record<string, AnyCliCommand<LaobanCliContext>>;

    return value(makeCliRoot({
        ...builtInCliCommands,
        ...scriptCommands
    }));
}

export async function runLaobanApp(di: LaobanDi): Promise<number> {
    const context = di.makeContext();

    try {
        const cliModelOrErrors = await makeLaobanCliModel(di);
        if (isErrors(cliModelOrErrors)) {
            di.dumpErrors(context.observability, cliModelOrErrors);
            return 1;
        }

        const cliModel = cliModelOrErrors.value;

        const validation =
            makeValidateCliModel<LaobanCliContext>()([], context.observability)(cliModel);

        if (isErrors(validation)) {
            di.dumpErrors(context.observability, validation);
            return 1;
        }

        const command = di.makeCommand();

        addCliModelToCommander(
            command,
            cliModel,
            makeCommanderCliAdapter<LaobanCliContext>({
                observability: context.observability,
                makeContext: di.makeContext,
                onError: async (observability, e) => {
                    dumpErrors(observability, e);
                }
            })
        );

        await command.parseAsync(di.argv);
        return 0;
    } catch (e) {
        di.dumpErrors(context.observability, e);
        return 1;
    }
}