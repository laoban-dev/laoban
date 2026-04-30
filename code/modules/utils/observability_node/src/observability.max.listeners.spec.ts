import {Writable} from "node:stream"
import * as os from "node:os"
import {setWritableMaxListenersFromCpu} from "./observability.max.listeners"

jest.mock("node:os", () => ({
    cpus: jest.fn(),
}))

describe("setWritableMaxListenersFromCpu", () => {
    beforeEach(() => {
        jest.resetAllMocks()
    })

    it("sets max listeners to cpu count * multiplier + offset", () => {
        jest.mocked(os.cpus).mockReturnValue([
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        ])

        const writable = new Writable({
            write(_chunk, _encoding, callback) {
                callback()
            },
        })

        const result = setWritableMaxListenersFromCpu(writable, 2, 5)

        expect(result).toBe(writable)
        expect(writable.getMaxListeners()).toBe(13)
    })

    it("does not set below Node's default minimum of 10", () => {
        jest.mocked(os.cpus).mockReturnValue([
            {} as any,
            {} as any,
        ])

        const writable = new Writable({
            write(_chunk, _encoding, callback) {
                callback()
            },
        })

        setWritableMaxListenersFromCpu(writable, 1, 0)

        expect(writable.getMaxListeners()).toBe(10)
    })

    it("uses default multiplier and offset", () => {
        jest.mocked(os.cpus).mockReturnValue([
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
        ])

        const writable = new Writable({
            write(_chunk, _encoding, callback) {
                callback()
            },
        })

        setWritableMaxListenersFromCpu(writable)

        expect(writable.getMaxListeners()).toBe(13)
    })
})