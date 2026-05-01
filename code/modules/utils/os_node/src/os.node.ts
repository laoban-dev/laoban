import * as os from "node:os";
import {OsOps} from "@laoban/os";


export const nodeOsOps: OsOps = {
    cpuCount: () => Math.max(1, os.cpus().length)
}