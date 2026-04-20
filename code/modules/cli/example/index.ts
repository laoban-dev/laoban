#!/usr/bin/env node

import {Command} from "commander";
import {exampleCli, ExampleContext, makeValidateCliModel} from "@laoban/clidsl";
import {consoleLogSink, createNodeObservability, dumpAndExitIfErrors} from "@laoban/observability_node";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";

const observability = createNodeObservability({
    correlationId: 'example',
    sinks: [consoleLogSink]
});
const cliDsl = exampleCli;

dumpAndExitIfErrors(observability, makeValidateCliModel<ExampleContext>()([], observability)(cliDsl));

const command = new Command();

addCliModelToCommander(
    command,
    cliDsl,
    makeCommanderCliAdapter({
        observability,
        makeContext: () => ({cwd: process.cwd(), observability})
    })
);

command.parseAsync(process.argv);