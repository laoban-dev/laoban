#!/usr/bin/env node

import {dumpErrors} from "@laoban/observability";
import {makeLaobanDi} from "./src/laoban.di";
import {runLaobanApp} from "./src/laoban.app";

const di = makeLaobanDi();

runLaobanApp(di).catch(e => {
    const context = di.makeContext();
    dumpErrors(context.observability, e);
    process.exit(1);
});