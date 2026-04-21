#!/usr/bin/env node

import {Command} from "commander";
import {CliGroup, CliRoot, makeValidateCliModel, root} from "@laoban/clidsl";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {laobanConfigCommands} from "@laoban/config_cli";
import {defaultLoadTextConfig} from "@laoban/files";
import {nodeFileOps, nodeFileOpsDefaults, nodeLoadTextInfrastructure} from "@laoban/files_node";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {dumpErrors} from "@laoban/observability";
import {consoleLogSink, createNodeObservability, dumpAndExitIfErrors} from "@laoban/observability_node";
import {LaobanPackageCliContext, laobanPackageCommands, loadConfigAndPackages} from "@laoban/package_cli";
import {LaobanScriptCliContext, makeScriptCommands} from "@laoban/scripts_cli";
import {isErrors} from "@laoban/errors";

const observability = createNodeObservability({
    correlationId: "laoban cli",
    sinks: [consoleLogSink]
});

type LaobanCliContext =
    LaobanPackageCliContext & LaobanScriptCliContext;

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
        executeLaobanScript: async (scriptName, script, values, context) => {
            console.log('Executing', scriptName, values)
        }
    };
}

const staticCli = {
    config: laobanConfigCommands,
    packages: laobanPackageCommands
};

function makeCliRoot(commands: Record<string, CliGroup>): CliRoot<LaobanCliContext> {
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
    commands: Record<string, CliGroup<LaobanCliContext>>,
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
    if (isErrors(loadedConfig)) return dumpAndExitIfErrors(observability, loadedConfig)
    const scripts = makeScriptCommands(loadedConfig.value.config.scripts ?? {});
    return makeCliRoot({...staticCli, ...scripts})
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