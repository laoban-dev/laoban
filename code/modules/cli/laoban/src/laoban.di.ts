import {Command} from "commander";
import * as process from "node:process";

import {defaultLoadTextConfig} from "@laoban/files";
import {nodeFileOps, nodeFileOpsDefaults, nodeLoadTextInfrastructure} from "@laoban/files_node";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {
    ChannelsState,
    defaultObservabilityTemplates,
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
import {loadConfigAndPackages} from "@laoban/package_cli";
import {safePathSegment, safePrettyJson} from "@laoban/safe";
import {
    defaultHandleLaobanScript,
    makeScriptExecutionItemTemplateDictionary,
    Purpose,
    purposes
} from "@laoban/scripts_cli";

import {LaobanCliContext} from "./laoban.context";

export type LaobanDi = {
    argv: string[];
    makeCommand: () => Command;
    makeContext: () => LaobanCliContext;
    loadLaobanConfig: typeof loadLaobanConfig;
    handleFatalErrors: typeof dumpAndExitIfErrors;
};

export function makeReference(pathSafeNow: string) {
    return (moduleName: ModuleName) => (purpose: Purpose): string => {
        const safeModuleName = moduleName ?? "__root__";

        switch (purpose) {
            case "log":
                return `.log/${safeModuleName}.log`;

            case "session":
                return `.session/${pathSafeNow}/${safeModuleName}.log`;
        }
    };
}

export function makeChannelsState(
    pathSafeNow: string,
    onError: (e: unknown) => void
): ChannelsState<Purpose, NodeReadChannel, NodeWriteChannel, string> {
    return {
        state: {},
        onError: error => onError(safePrettyJson(error)),
        purposes,
        asyncWrites: new Set(),
        tc: nodeChannelTc({
            reference: makeReference(pathSafeNow),
            keyFrom: moduleName => moduleName ?? ""
        })
    };
}

export function makeLaobanDi(argv: string[] = process.argv): LaobanDi {
    const now = new Date().toISOString();
    const pathSafeNow = safePathSegment(now);
    const command = argv[2] ?? "root";
    const correlationId = `${pathSafeNow}/${safePathSegment(command)}`;

    const onError = (e: unknown) => console.error(e);

    const reference = makeReference(pathSafeNow);

    const {observability} = createNodeObservability<Purpose>({
        channel: process.stdout,
        purposes,
        onError,
        reference
    });

    const channelsState = makeChannelsState(pathSafeNow, onError);

    const fileOps = nodeFileOps(nodeFileOpsDefaults);

    const loadLaobanFileConfig = defaultLoadTextConfig(
        {infrastructure: nodeLoadTextInfrastructure},
        {
            markers: {
                "@laoban@": "https://raw.githubusercontent.com/phil-rice/laoban/master/common"
            },
            observability
        }
    );

    const cwd = process.cwd();
    const stdOut = process.stdout;

    return {
        argv,
        makeCommand: () => new Command(),
        loadLaobanConfig,
        handleFatalErrors: dumpAndExitIfErrors,

        makeContext: () => ({
            correlationId,
            channelsState,
            timeService: realTimeService,
            module: null,

            dictionary: {},
            templates: defaultObservabilityTemplates,
            debugLevels: {},
            observability,

            fileOps,
            loadLaobanFileConfig,

            cwd,
            loadLaobanConfig,
            stdOut,

            loadConfigAndPackagesFn: loadConfigAndPackages,
            handleLaobanScript: defaultHandleLaobanScript,
            makeDictionary: makeScriptExecutionItemTemplateDictionary
        })
    };
}