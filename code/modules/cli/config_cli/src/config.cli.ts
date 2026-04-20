import {mapErrorsOr} from "@laoban/errors";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {type BasicCliContext, type CliModel, defineCommand, group} from "@laoban/clidsl";
import {FileOps, LoadTextConfig} from "@laoban/files";

export type LaobanDebugContext = "cli";

export interface LaobanConfigCliContext extends BasicCliContext {
    cwd: string;
    fileOps: FileOps
    loadLaobanFileConfig: LoadTextConfig
}

export function loadConfig(context: LaobanConfigCliContext) {
    return loadLaobanConfig(
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
    execute: async (_values, context) => {
        return mapErrorsOr(await loadConfig(context), configDetails =>
            configDetails.config)
    },
});

const configListCommand = defineCommand<{}, LaobanConfigCliContext>()({
    description: "List configuration sources",
    positionals: {},
    options: {},
    execute: async (_values, context) => {
        return mapErrorsOr(await loadConfig(context), configDetails => {
            const details = {
                directory: configDetails.configDirectory,
                mainFile: configDetails.configFile,
                files: configDetails.loadedFiles
            }
            context.observability.logger("info", JSON.stringify(details, null, 2));
            return details;
        })
    },
});

export const laobanConfigCommands: CliModel<LaobanConfigCliContext> = group(
    "Configuration commands",
    {
        config: group("Configuration commands", {
            view: configViewCommand,
            list: configListCommand,
        }),
    }
);