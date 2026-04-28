import {AnyCliCommand, CliGroup, CliRoot, makeValidateCliModel, root} from "@laoban/clidsl";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {laobanConfigCommands} from "@laoban/config_cli";
import {isErrors} from "@laoban/errors";
import {dumpErrors} from "@laoban/observability";
import {laobanPackageCommands} from "@laoban/package_cli";
import {makeScriptCommands} from "@laoban/scripts_cli";

import {LaobanCliContext} from "./laoban.context";
import {LaobanDi} from "./laoban.di";

export type LaobanCliChild =
    CliGroup<LaobanCliContext> |
    AnyCliCommand<LaobanCliContext>;

export const builtInCliCommands: Record<string, LaobanCliChild> = {
    config: laobanConfigCommands as CliGroup<LaobanCliContext>,
    packages: laobanPackageCommands as CliGroup<LaobanCliContext>
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

export async function makeLaobanCliModel(di: LaobanDi): Promise<CliRoot<LaobanCliContext>> {
    const builtInCliModel = makeCliRoot(builtInCliCommands);

    if (isBuiltInTopLevelCommand(builtInCliCommands, di.argv)) {
        return builtInCliModel;
    }

    const context = di.makeContext();

    const loadedConfig = await di.loadLaobanConfig(
        {
            fileOps: context.fileOps,
            observability: context.observability,
            markerFileName: "laoban.json",
            loadTextConfig: context.loadLaobanFileConfig
        },
        context.cwd
    );

    if (isErrors(loadedConfig)) {
        return di.handleFatalErrors(context.observability, loadedConfig);
    }

    const scriptCommands = makeScriptCommands(
        loadedConfig.value.config.scripts ?? {}
    ) as Record<string, AnyCliCommand<LaobanCliContext>>;

    return makeCliRoot({
        ...builtInCliCommands,
        ...scriptCommands
    });
}

export async function runLaobanApp(di: LaobanDi): Promise<void> {
    const context = di.makeContext();
    const cliModel = await makeLaobanCliModel(di);

    di.handleFatalErrors(
        context.observability,
        makeValidateCliModel<LaobanCliContext>()([], context.observability)(cliModel)
    );

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
}