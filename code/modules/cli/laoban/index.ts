#!/usr/bin/env node

import {runLaobanNodeCli} from "@laoban/laoban_cli";

runLaobanNodeCli().then(exitCode => {
    process.exitCode = exitCode;
});