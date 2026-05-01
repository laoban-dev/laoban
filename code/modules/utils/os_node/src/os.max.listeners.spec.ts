import { Writable } from "node:stream"
import { OsOps } from "@laoban/os"
import { setWritableMaxListenersFromCpu } from "./os.max.listeners"

class RecordingWritable extends Writable {
    _write(
        _chunk: unknown,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        callback()
    }
}

const osOps = (cpuCount: number): OsOps => ({
    cpuCount: () => cpuCount,
})

describe("setWritableMaxListenersFromCpu", () => {
    test("sets max listeners from cpu count using default multiplier and offset", () => {
        const writable = new RecordingWritable()

        const result = setWritableMaxListenersFromCpu(osOps(8), writable)

        expect(result).toBe(writable)
        expect(writable.getMaxListeners()).toBe(13)
    })

    test("uses minimum limit of 10", () => {
        const writable = new RecordingWritable()

        setWritableMaxListenersFromCpu(osOps(1), writable)

        expect(writable.getMaxListeners()).toBe(10)
    })

    test("uses supplied multiplier and offset", () => {
        const writable = new RecordingWritable()

        setWritableMaxListenersFromCpu(osOps(8), writable, 2, 5)

        expect(writable.getMaxListeners()).toBe(21)
    })

    test("uses minimum limit of 10 even with custom multiplier and offset", () => {
        const writable = new RecordingWritable()

        setWritableMaxListenersFromCpu(osOps(2), writable, 1, 0)

        expect(writable.getMaxListeners()).toBe(10)
    })

    test("calls cpuCount once", () => {
        const writable = new RecordingWritable()
        const cpuCount = jest.fn(() => 8)

        setWritableMaxListenersFromCpu({ cpuCount }, writable)

        expect(cpuCount).toHaveBeenCalledTimes(1)
    })
})