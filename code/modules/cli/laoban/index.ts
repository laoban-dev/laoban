#!/usr/bin/env node

import {runLaobanNodeCli} from "./src/laoban.node";

runLaobanNodeCli().then(exitCode => {
    process.exitCode = exitCode;
});