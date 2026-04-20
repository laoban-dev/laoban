#!/usr/bin/env node

import {Command} from "commander";
import {addCliModelToCommander, type CliModel, exampleCli, makeValidateCliModel} from "@laoban/clidsl";
import {createNodeObservability} from "@laoban/observability_node";
import {isErrors} from "@laoban/errors";
import {makeCommanderCliAdapter} from "@laoban/commander";

const observability = createNodeObservability();
const cliDsl: CliModel = exampleCli;

const validationErrors = makeValidateCliModel()([], observability)(cliDsl);
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
        makeContext: () => ({observability})
    })
);

command.parseAsync(process.argv);