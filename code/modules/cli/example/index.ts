#!/usr/bin/env node

import {Command} from "commander";
import {exampleCli, ExampleContext, makeValidateCliModel} from "@laoban/clidsl";
import {consoleLogSink, createNodeObservability} from "@laoban/observability_node";
import {isErrors} from "@laoban/errors";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";

const observability = createNodeObservability({
    correlationId: 'example',
    sinks: [consoleLogSink]
});
const cliDsl = exampleCli;

const validationErrors = makeValidateCliModel<ExampleContext>()([], observability)(cliDsl);
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
    makeCommanderCliAdapter({
        observability,
        makeContext: () => ({cwd: process.cwd(), observability})
    })
);

command.parseAsync(process.argv);