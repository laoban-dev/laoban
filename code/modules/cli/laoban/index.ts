#!/usr/bin/env node

import {Command} from "commander";
import {AnyCliCommand, CliGroup, CliRoot, makeValidateCliModel, root} from "@laoban/clidsl";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {laobanConfigCommands} from "@laoban/config_cli";
import {defaultLoadTextConfig} from "@laoban/files";
import {nodeFileOps, nodeFileOpsDefaults, nodeLoadTextInfrastructure} from "@laoban/files_node";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {dumpErrors} from "@laoban/observability";
import {consoleLogSink, createNodeObservability, dumpAndExitIfErrors} from "@laoban/observability_node";
import {LaobanPackageCliContext, laobanPackageCommands, loadConfigAndPackages} from "@laoban/package_cli";
import {
    LaobanScriptCliContext,
    makeScriptCommands,
    makeScriptExecutionItemTemplateDictionary
} from "@laoban/scripts_cli";
import {isErrors} from "@laoban/errors";
import {defaultHandleLaobanScript} from "@laoban/scripts_cli";

const observability = createNodeObservability({
    correlationId: "laoban cli",
    sinks: [consoleLogSink]
});

type LaobanCliContext =
    LaobanPackageCliContext & LaobanScriptCliContext;

type LaobanCliChild =
    CliGroup<LaobanCliContext> | AnyCliCommand<LaobanCliContext>;

function makeInfrastructure() {
    return {
        fileOps: nodeFileOps(nodeFileOpsDefaults),
        loadLaobanFileConfig: defaultLoadTextConfig(
            {infrastructure: nodeLoadTextInfrastructure},
            {
                markers: {"@laoban@": "https://raw.githubusercontent.com/phil-rice/laoban/master/common"},
                observability
            }
        )
    };
}

function makeContext(): LaobanCliContext {
    const infrastructure = makeInfrastructure();
    return {
        observability,
        ...infrastructure,
        cwd: process.cwd(),
        loadLaobanConfig,
        loadConfigAndPackagesFn: loadConfigAndPackages,
        handleLaobanScript: defaultHandleLaobanScript,
        makeDictionary: makeScriptExecutionItemTemplateDictionary

    };
}

const staticCli: Record<string, LaobanCliChild> = {
    config: laobanConfigCommands as CliGroup<LaobanCliContext>,
    packages: laobanPackageCommands as CliGroup<LaobanCliContext>
};

function makeCliRoot(commands: Record<string, LaobanCliChild>): CliRoot<LaobanCliContext> {
    return root(
        "laoban",
        "a monorepo management tool",
        commands,
        "1.0.0"
    );
}

function firstCommandToken(argv: string[]): string | undefined {
    const token = argv[2];
    return token && !token.startsWith("-") ? token : undefined;
}

function isBuiltInTopLevelCommand(
    commands: Record<string, LaobanCliChild>,
    argv: string[]
): boolean {
    const commandName = firstCommandToken(argv);
    if (!commandName) return false;
    return Object.prototype.hasOwnProperty.call(commands, commandName);
}

async function makeCliDsl(argv: string[]): Promise<CliRoot<LaobanCliContext>> {
    const staticCliDsl = makeCliRoot(staticCli);

    if (isBuiltInTopLevelCommand(staticCli, argv)) {
        return staticCliDsl;
    }

    const context = makeContext();

    const loadedConfig = await loadLaobanConfig(
        {
            fileOps: context.fileOps,
            observability: context.observability,
            markerFileName: "laoban.json",
            loadTextConfig: context.loadLaobanFileConfig
        },
        context.cwd
    );

    if (isErrors(loadedConfig)) return dumpAndExitIfErrors(observability, loadedConfig);

    const scripts: Record<string, LaobanCliChild> =
        makeScriptCommands(loadedConfig.value.config.scripts ?? {}) as Record<string, AnyCliCommand<LaobanCliContext>>;

    return makeCliRoot({...staticCli, ...scripts});
}

async function main() {
    const argv = process.argv;
    const cliDsl = await makeCliDsl(argv);

    dumpAndExitIfErrors(
        observability,
        makeValidateCliModel<LaobanCliContext>()([], observability)(cliDsl)
    );

    const command = new Command();

    addCliModelToCommander(
        command,
        cliDsl,
        makeCommanderCliAdapter<LaobanCliContext>({
            observability,
            makeContext,
            onError: async (observability, e) => {
                dumpErrors(observability, e);
            }
        })
    );

    await command.parseAsync(argv);
}

main().catch(e => {
    dumpErrors(observability, e);
    process.exit(1);
});