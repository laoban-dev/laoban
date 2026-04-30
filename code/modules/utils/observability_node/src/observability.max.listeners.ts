import * as os from "node:os"
import {Writable} from "node:stream"

export function setWritableMaxListenersFromCpu(
    writable: Writable,
    multiplier = 1,
    offset = 5,
): Writable {
    const limit = Math.max(10, os.cpus().length * multiplier + offset)
    writable.setMaxListeners(limit)
    return writable
}