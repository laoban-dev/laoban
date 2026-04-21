#!/usr/bin/env node

import {Command} from "commander";
import {type CliModel, CliRoot, makeValidateCliModel, root} from "@laoban/clidsl";
import {consoleLogSink, createNodeObservability, dumpAndExitIfErrors} from "@laoban/observability_node";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {LaobanConfigCliContext, laobanConfigCommands} from "@laoban/config_cli";
import {nodeFileOps, nodeFileOpsDefaults} from "@laoban/files_node";
import {defaultLoadTextConfig} from "@laoban/files";
import {nodeLoadTextInfrastructure} from "@laoban/files_node";
import {dumpErrors} from "@laoban/observability";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {LaobanPackageCliContext, laobanPackageCommands, loadConfigAndPackages} from "@laoban/package_cli";

const observability = createNodeObservability({
    correlationId: "laoban cli",
    sinks: [consoleLogSink]
});
const cliDsl: CliRoot<LaobanPackageCliContext> = root(
    'laoban',
    'a monorepo management tool',
    {
        config: laobanConfigCommands,
        packages: laobanPackageCommands
    },
    '1.0.0');

dumpAndExitIfErrors(observability, makeValidateCliModel<LaobanPackageCliContext>()([], observability)(cliDsl));

const command = new Command();

addCliModelToCommander(
    command,
    cliDsl,
    makeCommanderCliAdapter<LaobanPackageCliContext>({
        observability,
        makeContext: (): LaobanPackageCliContext => ({
            observability,
            fileOps: nodeFileOps(nodeFileOpsDefaults),
            loadLaobanFileConfig: defaultLoadTextConfig({
                infrastructure: nodeLoadTextInfrastructure
            }, {
                markers: {"@laoban@": "https://raw.githubusercontent.com/phil-rice/laoban/master/common"},
                observability
            }),
            cwd: process.cwd(),
            loadLaobanConfig,
            loadConfigAndPackagesFn: loadConfigAndPackages
        }),
        onError: async (observability, e) => {
            dumpErrors(observability, e);
        }
    })
);

command.parseAsync(process.argv);