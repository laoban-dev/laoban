import * as process from "node:process";

import {isErrors} from "@laoban/errors";
import {nodeOsOps, setWritableMaxListenersFromCpu} from "@laoban/node_os";

import {runLaobanApp} from "./laoban.app";
import {makeLaobanDi} from "./laoban.di";

export async function runLaobanNodeCli(): Promise<number> {
    setWritableMaxListenersFromCpu(nodeOsOps, process.stdout);

    const diOrError = makeLaobanDi({
        argv: process.argv,
        cwd: process.cwd(),
        env: process.env,
        stdout: process.stdout,
        stderr: process.stderr,
    });

    if (isErrors(diOrError)) {
        console.error(JSON.stringify(diOrError, null, 2));
        return 1;
    }

    return runLaobanApp(diOrError.value);
}