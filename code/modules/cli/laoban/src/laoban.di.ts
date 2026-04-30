import {Command} from "commander";
import * as process from "node:process";

import {defaultLoadTextConfig} from "@laoban/files";
import {nodeFileOps, nodeFileOpsDefaults, nodeLoadTextInfrastructure} from "@laoban/files_node";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {Env} from "@laoban/records"
import {
    ChannelsState, DebugConfig,
    defaultObservabilityTemplates,
    ModuleName, parseDebugConfig, parseDebugName,
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
import {makeNodeExecution, NodeExecution, NodeExecutionOptions} from "@laoban/node_execution/src/node.execution";
import {defaultFileCommands} from "@laoban/node_execution";
import {defaultPrefixAndValueOptions} from "@laoban/execution";
import {ErrorsOr, mapErrorsOr, mapErrorsOrK} from "@laoban/errors";

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

export function makeLaobanDi(argv: string[] = process.argv): ErrorsOr<LaobanDi> {
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
    const env: Env = process.env;
    const nodeExecuteOptions: NodeExecutionOptions = {
        fileCommands: defaultFileCommands,
        prefixAndValueOptions: defaultPrefixAndValueOptions
    }
    const execution: NodeExecution = makeNodeExecution(nodeExecuteOptions)
    return mapErrorsOr(parseDebugConfig(command), (debugConfig: DebugConfig) => {
            const result: LaobanDi = {
                argv,
                makeCommand: () => new Command(),
                loadLaobanConfig,
                handleFatalErrors: dumpAndExitIfErrors,

                makeContext: () => ({
                    correlationId,
                    channelsState,
                    execution,
                    timeService: realTimeService,
                    module: null,
                    env,
                    debugConfig,
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
            return result;
        }
    )
}