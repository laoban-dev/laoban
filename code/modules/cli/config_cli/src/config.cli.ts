import {mapErrorsOr, type ErrorsOr} from "@laoban/errors";
import {LoadConfigFn, type LoadedLaobanConfig, type LoaderIssue} from "@laoban/laoban_config";
import {type BasicCliContext, CliGroup, type CliModel, defineCommand, group, root} from "@laoban/clidsl";
import {type FileOps, type LoadTextConfig} from "@laoban/files";

export type LaobanDebugContext = "cli";


export interface LaobanConfigCliContext extends BasicCliContext {
    cwd: string;
    fileOps: FileOps;
    loadLaobanFileConfig: LoadTextConfig;
    loadLaobanConfig: LoadConfigFn;
}

export function loadConfig(context: LaobanConfigCliContext): Promise<ErrorsOr<LoadedLaobanConfig, LoaderIssue>> {
    return context.loadLaobanConfig(
        {
            fileOps: context.fileOps,
            observability: context.observability,
            markerFileName: "laoban.json",
            loadTextConfig: context.loadLaobanFileConfig
        },
        context.cwd
    );
}

const configViewCommand = defineCommand<{}, LaobanConfigCliContext>()({
    description: "View effective configuration",
    positionals: {},
    options: {},
    execute: async (_values, context) =>
        mapErrorsOr(
            await loadConfig(context),
            configDetails => configDetails.config
        )
});

const configListCommand = defineCommand<{}, LaobanConfigCliContext>()({
    description: "List configuration sources",
    positionals: {},
    options: {},
    execute: async (_values, context) =>
        mapErrorsOr(
            await loadConfig(context),
            configDetails => {
                const details = {
                    directory: configDetails.configDirectory,
                    mainFile: configDetails.configFile,
                    files: configDetails.loadedFiles
                };
                context.observability.logger("info", JSON.stringify(details, null, 2));
                return details;
            }
        )
});

export const laobanConfigCommands: CliGroup<LaobanConfigCliContext> =
    group("Configuration commands", {
        view: configViewCommand,
        list: configListCommand
    })
