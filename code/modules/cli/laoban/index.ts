#!/usr/bin/env node

import {Command} from "commander";
import {type CliModel, makeValidateCliModel} from "@laoban/clidsl";
import {consoleLogSink, createNodeObservability} from "@laoban/observability_node";
import {isErrors} from "@laoban/errors";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {LaobanConfigCliContext, laobanConfigCommands} from "@laoban/config_cli";
import {nodeFileOps, nodeFileOpsDefaults} from "@laoban/files_node";
import {defaultLoadTextConfig} from "@laoban/files";
import {nodeLoadTextInfrastructure} from "@laoban/files_node/src/load.text.node";
import {dumpErrors} from "@laoban/observability";

const observability = createNodeObservability({
    correlationId: "laoban cli",
    sinks: [consoleLogSink]
});
const cliDsl: CliModel<LaobanConfigCliContext> = laobanConfigCommands;

const validationErrors = makeValidateCliModel<LaobanConfigCliContext>()([], observability)(cliDsl);
if (isErrors(validationErrors)) {
    console.error("CLI model validation failed with the following errors:");
    for (const error of validationErrors.errors) {
        console.error(`- ${error.message}`);
    }
    process.exit(1);
}

const command = new Command();

addCliModelToCommander(
    command,
    cliDsl,
    makeCommanderCliAdapter<LaobanConfigCliContext>({
        observability,
        makeContext: () => ({
            observability,
            fileOps: nodeFileOps(nodeFileOpsDefaults),
            loadLaobanFileConfig: defaultLoadTextConfig({
                infrastructure: nodeLoadTextInfrastructure
            }, {
                markers: {"@laoban@": "https://raw.githubusercontent.com/phil-rice/laoban/master/common"},
                observability
            }),
            cwd: process.cwd()
        }),
        onError: async (observability, e) => {
            dumpErrors(observability, e);
        }
    })
);

command.parseAsync(process.argv);