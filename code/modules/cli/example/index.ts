#!/usr/bin/env node

import {Command} from "commander";
import {exampleCli, ExampleContext, makeValidateCliModel} from "@laoban/clidsl";
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander";
import {dumpErrors} from "@laoban/observability";
import {createNodeObservability, dumpAndExitIfErrors} from "@laoban/observability_node";
import * as path from "node:path";

type Purpose = ".log" | ".session"

const {observability} = createNodeObservability<Purpose>({
    correlationId: "example",
    channel: process.stdout,
    purposes: [".log", ".session"],
    onError: e => console.error(e),
    reference: moduleName => purpose =>
        path.join(".laoban", String(moduleName ?? "root"), purpose),
})

const cliDsl = exampleCli;

dumpAndExitIfErrors(
    observability,
    makeValidateCliModel<ExampleContext>()([], observability)(cliDsl)
);

const command = new Command();

addCliModelToCommander(
    command,
    cliDsl,
    makeCommanderCliAdapter<ExampleContext>({
        observability,
        makeContext: () => ({
            cwd: process.cwd(),
            observability,
        }),
        onError: async (observability, e) => {
            dumpErrors(observability, e);
        },
    })
);

command.parseAsync(process.argv).catch(e => {
    dumpErrors(observability, e);
    process.exit(1);
});