import {Writable} from "node:stream"
import {OsOps} from "@laoban/os";

export function setWritableMaxListenersFromCpu(
    osOps: OsOps,
    writable: Writable,
    multiplier = 1,
    offset = 5,
): Writable {
    const limit = Math.max(10, osOps.cpuCount() * multiplier + offset)
    writable.setMaxListeners(limit)
    return writable
}