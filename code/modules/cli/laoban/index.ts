#!/usr/bin/env node

import {Command} from "commander";
import {AnyCliCommand, CliGroup, CliRoot, makeValidateCliModel, root} from "@laoban/clidsl";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {laobanConfigCommands} from "@laoban/config_cli";
import {defaultLoadTextConfig} from "@laoban/files";
import {nodeFileOps, nodeFileOpsDefaults, nodeLoadTextInfrastructure} from "@laoban/files_node";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {
    ChannelsState,
    defaultObservabilityTemplates,
    dumpErrors,
    ModuleName,
    realTimeService
} from "@laoban/observability";
import {
    createNodeObservability,
    dumpAndExitIfErrors,
    nodeChannelTc,
    NodeReadChannel,
    NodeWriteChannel
} from "@laoban/observability_node";
import {LaobanPackageCliContext, laobanPackageCommands, loadConfigAndPackages} from "@laoban/package_cli";
import {
    defaultHandleLaobanScript,
    LaobanScriptCliContext,
    makeScriptCommands,
    makeScriptExecutionItemTemplateDictionary, Purpose,
    purposes
} from "@laoban/scripts_cli";
import {isErrors} from "@laoban/errors";
import * as path from "node:path";
import {safePathSegment, safePrettyJson} from "@laoban/safe";
import * as process from "node:process";

const {observability} = createNodeObservability<Purpose>({
    channel: process.stdout,
    purposes,
    onError: e => console.error(e),
    reference: moduleName => purpose =>
        path.join(".laoban", String(moduleName ?? "root"), purpose),
})

type LaobanCliContext = LaobanPackageCliContext & LaobanScriptCliContext;

export const args = process.argv
type LaobanCliChild = CliGroup<LaobanCliContext> | AnyCliCommand<LaobanCliContext>;

const now = new Date().toISOString();
const pathSafeNow = safePathSegment(now)
export const correlationId = `${pathSafeNow}/${args[2]}`
export const makeReference = (moduleName: ModuleName) => (purpose: Purpose): string => {
    const safeModuleName = moduleName ?? "__root__";
    switch (purpose) {
        case 'log':
            return `.log/${safeModuleName}.log`;
        case 'session':
            return `.session/${pathSafeNow}/${safeModuleName}.log`
    }
};
export const channelsState: ChannelsState<Purpose, NodeReadChannel, NodeWriteChannel, string> = {
    state: {},
    onError: error =>
        console.error(safePrettyJson(error)),
    purposes,
    asyncWrites: new Set(),
    tc: nodeChannelTc({
        reference: makeReference,
        keyFrom: moduleName => moduleName ?? ''
    })
}


export function laobanCliContext(): LaobanCliContext {
    const infrastructure = makeInfrastructure();
    return {
        correlationId,
        channelsState,
        timeService: realTimeService,
        module: null,
        dictionary: {},
        templates: defaultObservabilityTemplates,
        debugLevels: {},
        observability,
        ...infrastructure,
        cwd: process.cwd(),
        loadLaobanConfig,
        stdOut: process.stdout,
        loadConfigAndPackagesFn: loadConfigAndPackages,
        handleLaobanScript: defaultHandleLaobanScript,
        makeDictionary: makeScriptExecutionItemTemplateDictionary
    }
}

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

    const context = laobanCliContext();

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
            makeContext: laobanCliContext,
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