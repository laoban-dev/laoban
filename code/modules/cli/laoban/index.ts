#!/usr/bin/env node

import {dumpErrors} from "@laoban/observability";
import {makeLaobanDi} from "./src/laoban.di";
import {runLaobanApp} from "./src/laoban.app";
import {isErrors} from "@laoban/errors";
import {setWritableMaxListenersFromCpu} from "@laoban/observability_node/src/observability.max.listeners";

setWritableMaxListenersFromCpu(process.stdout);

const diOrError = makeLaobanDi();
if (isErrors(diOrError)) {
    console.log(JSON.stringify(diOrError, null, 2));
    process.exit(1)
}
const di = diOrError.value;
runLaobanApp(di).catch(e => {
    const context = di.makeContext();
    dumpErrors(context.observability, e);
    process.exit(1);
});