#!/usr/bin/env node

import {Command} from "commander";
import {type CliModel, makeValidateCliModel, root} from "@laoban/clidsl";
import {consoleLogSink, createNodeObservability, dumpAndExitIfErrors} from "@laoban/observability_node";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {LaobanConfigCliContext, laobanConfigCommands} from "@laoban/config_cli";
import {nodeFileOps, nodeFileOpsDefaults} from "@laoban/files_node";
import {defaultLoadTextConfig} from "@laoban/files";
import {nodeLoadTextInfrastructure} from "@laoban/files_node";
import {dumpErrors} from "@laoban/observability";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {laobanPackageCommands} from "@laoban/package_cli";

const observability = createNodeObservability({
    correlationId: "laoban cli",
    sinks: [consoleLogSink]
});
const cliDsl: CliModel<LaobanConfigCliContext> = root(
    'laoban',
    'a monorepo management tool',
    {
        config: laobanConfigCommands,
        packages: laobanPackageCommands
    },
    '1.0.0');

dumpAndExitIfErrors(observability, makeValidateCliModel<LaobanConfigCliContext>()([], observability)(cliDsl));

const command = new Command();

addCliModelToCommander(
    command,
    cliDsl,
    makeCommanderCliAdapter<LaobanConfigCliContext>({
        observability,
        makeContext: (): LaobanConfigCliContext => ({
            observability,
            fileOps: nodeFileOps(nodeFileOpsDefaults),
            loadLaobanFileConfig: defaultLoadTextConfig({
                infrastructure: nodeLoadTextInfrastructure
            }, {
                markers: {"@laoban@": "https://raw.githubusercontent.com/phil-rice/laoban/master/common"},
                observability
            }),
            cwd: process.cwd(),
            loadLaobanConfig
        }),
        onError: async (observability, e) => {
            dumpErrors(observability, e);
        }
    })
);

command.parseAsync(process.argv);