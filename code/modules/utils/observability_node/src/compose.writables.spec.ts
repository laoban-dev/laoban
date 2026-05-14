import {Readable, Writable, finished} from "stream"
import {makeErrorFromException} from "@laoban/errors"
import {composeNodeWritables} from "./compose.writables"

const waitForEvent = (stream: Writable, event: string): Promise<unknown[]> =>
    new Promise(resolve => stream.once(event, (...args) => resolve(args)))

const writeTo = (
    writable: Writable,
    chunk: string | Buffer,
): Promise<void> =>
    new Promise((resolve, reject) => {
        writable.write(chunk, err => {
            if (err) reject(err)
            else resolve()
        })
    })

const end = (writable: Writable): Promise<void> =>
    new Promise((resolve, reject) => {
        writable.end(err => {
            if (err) reject(err)
            else resolve()
        })
    })

const expectWriteToRejectAndSwallowStreamError = async (
    writable: Writable,
    chunk: string | Buffer,
    expectedError: Error,
): Promise<void> => {
    const swallowError = jest.fn()
    writable.on("error", swallowError)

    const finishedPromise = new Promise<void>((resolve, reject) =>
        finished(writable, err => {
            if (err) reject(err)
            else resolve()
        }),
    )

    await expect(writeTo(writable, chunk)).rejects.toBe(expectedError)
    await expect(finishedPromise).rejects.toBe(expectedError)

    expect(swallowError).toHaveBeenCalledWith(expectedError)

    writable.off("error", swallowError)
}

const collectingWritable = () => {
    const chunks: Buffer[] = []

    const writable = new Writable({
        write(chunk, _encoding, callback) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            callback()
        },
    })

    return {
        writable,
        text: () => Buffer.concat(chunks).toString("utf8"),
    }
}

const issuesFrom = (onError: jest.Mock): unknown[] =>
    onError.mock.calls.map(([issue]) => issue)

describe("composeNodeWritables", () => {
    test("writes each chunk to all child writables", async () => {
        const first = collectingWritable()
        const second = collectingWritable()
        const onError = jest.fn()

        const composed = composeNodeWritables(
            [first.writable, second.writable],
            onError,
        )

        await writeTo(composed, "hello")
        await writeTo(composed, " world")

        expect(first.text()).toEqual("hello world")
        expect(second.text()).toEqual("hello world")
        expect(issuesFrom(onError)).toEqual([])
    })

    test("can be used as a pipe target", async () => {
        const first = collectingWritable()
        const second = collectingWritable()
        const onError = jest.fn()

        const composed = composeNodeWritables(
            [first.writable, second.writable],
            onError,
        )

        const finishedWriting = waitForEvent(composed, "finish")

        Readable.from(["hello", " ", "pipe"]).pipe(composed)

        await finishedWriting

        expect(first.text()).toEqual("hello pipe")
        expect(second.text()).toEqual("hello pipe")
        expect(issuesFrom(onError)).toEqual([])
    })

    test("does not treat child write returning false as failure", async () => {
        const chunks: Buffer[] = []

        const backpressuringWritable = new Writable({
            write(chunk, _encoding, callback) {
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
                callback()
            },
        })

        jest.spyOn(backpressuringWritable, "write").mockImplementation(
            ((
                chunk: any,
                encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
                callback?: (error?: Error | null) => void,
            ) => {
                const actualCallback =
                    typeof encodingOrCallback === "function"
                        ? encodingOrCallback
                        : callback

                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
                actualCallback?.()
                return false
            }) as any,
        )

        const other = collectingWritable()
        const onError = jest.fn()

        const composed = composeNodeWritables(
            [backpressuringWritable, other.writable],
            onError,
        )

        await writeTo(composed, "hello")

        expect(Buffer.concat(chunks).toString("utf8")).toEqual("hello")
        expect(other.text()).toEqual("hello")
        expect(issuesFrom(onError)).toEqual([])
    })

    test("completes composed write only after all child write callbacks complete", async () => {
        let releaseSlowWrite: (() => void) | undefined

        const fast = collectingWritable()

        const slow = new Writable({
            write(_chunk, _encoding, callback) {
                releaseSlowWrite = () => callback()
            },
        })

        const onError = jest.fn()
        const composed = composeNodeWritables([fast.writable, slow], onError)

        let completed = false
        const writePromise = writeTo(composed, "hello").then(() => {
            completed = true
        })

        await Promise.resolve()

        expect(completed).toEqual(false)

        releaseSlowWrite?.()
        await writePromise

        expect(completed).toEqual(true)
        expect(fast.text()).toEqual("hello")
        expect(issuesFrom(onError)).toEqual([])
    })

    test("child write callback failure calls onError and fails composed write", async () => {
        const childError = new Error("child write failed")

        const failing = new Writable({
            write(_chunk, _encoding, callback) {
                callback(childError)
            },
        })

        const other = collectingWritable()
        const onError = jest.fn()

        const composed = composeNodeWritables(
            [failing, other.writable],
            onError,
        )

        const childStreamError = waitForEvent(failing, "error")

        await expectWriteToRejectAndSwallowStreamError(
            composed,
            "hello",
            childError,
        )

        await expect(childStreamError).resolves.toEqual([childError])

        expect(issuesFrom(onError)).toEqual([
            makeErrorFromException(
                "composed writable write failed",
                childError,
            ),
        ])
    })

    test("synchronous child write throw calls onError and fails composed write", async () => {
        const thrown = new Error("write threw")

        const throwing = new Writable({
            write(_chunk, _encoding, callback) {
                callback()
            },
        })

        jest.spyOn(throwing, "write").mockImplementation(() => {
            throw thrown
        })

        const onError = jest.fn()
        const composed = composeNodeWritables([throwing], onError)

        await expectWriteToRejectAndSwallowStreamError(
            composed,
            "hello",
            thrown,
        )

        expect(issuesFrom(onError)).toEqual([
            makeErrorFromException(
                "composed writable write threw",
                thrown,
            ),
        ])
    })

    test("child error event calls onError and destroys composed writable", async () => {
        const child = collectingWritable()
        const onError = jest.fn()

        const composed = composeNodeWritables([child.writable], onError)

        const composedError = new Promise<unknown>(resolve =>
            composed.once("error", resolve),
        )

        const childError = new Error("child stream exploded")
        child.writable.emit("error", childError)

        await expect(composedError).resolves.toEqual(childError)

        expect(issuesFrom(onError)).toEqual([
            makeErrorFromException(
                "composed writable child stream error",
                childError,
            ),
        ])
        expect(composed.destroyed).toEqual(true)
    })

    test("removes child error listeners when composed writable is destroyed", () => {
        const child = collectingWritable()
        const onError = jest.fn()

        const before = child.writable.listenerCount("error")

        const composed = composeNodeWritables([child.writable], onError)

        expect(child.writable.listenerCount("error")).toEqual(before + 1)

        composed.destroy()

        expect(child.writable.listenerCount("error")).toEqual(before)
    })

    test("ending composed writable does not end child writables", async () => {
        const first = collectingWritable()
        const second = collectingWritable()
        const onError = jest.fn()

        const composed = composeNodeWritables(
            [first.writable, second.writable],
            onError,
        )

        await writeTo(composed, "hello")
        await end(composed)

        expect(composed.writableEnded).toEqual(true)

        // The composed writable is lifecycle-neutral. It does not own/end children.
        expect(first.writable.writableEnded).toEqual(false)
        expect(second.writable.writableEnded).toEqual(false)
        expect(issuesFrom(onError)).toEqual([])
    })

    test("zero child channels behaves as a successful no-op", async () => {
        const onError = jest.fn()
        const composed = composeNodeWritables([], onError)

        await writeTo(composed, "hello")
        await end(composed)

        expect(issuesFrom(onError)).toEqual([])
        expect(composed.writableEnded).toEqual(true)
    })

    test("partial fan-out failure is reported but not rolled back", async () => {
        const successful = collectingWritable()
        const childError = new Error("second child failed")

        const failing = new Writable({
            write(_chunk, _encoding, callback) {
                callback(childError)
            },
        })

        const onError = jest.fn()
        const composed = composeNodeWritables(
            [successful.writable, failing],
            onError,
        )

        const childStreamError = waitForEvent(failing, "error")

        await expectWriteToRejectAndSwallowStreamError(
            composed,
            "hello",
            childError,
        )

        await expect(childStreamError).resolves.toEqual([childError])

        expect(successful.text()).toEqual("hello")
        expect(issuesFrom(onError)).toEqual([
            makeErrorFromException(
                "composed writable write failed",
                childError,
            ),
        ])
    })

    test("uses default stderr error reporting when onError is omitted", async () => {
        const stderrSpy = jest
            .spyOn(process.stderr, "write")
            .mockImplementation(() => true)

        const childError = new Error("child write failed")

        const failing = new Writable({
            write(_chunk, _encoding, callback) {
                callback(childError)
            },
        })

        const composed = composeNodeWritables([failing])

        const childStreamError = waitForEvent(failing, "error")

        await expectWriteToRejectAndSwallowStreamError(
            composed,
            "hello",
            childError,
        )

        await expect(childStreamError).resolves.toEqual([childError])

        expect(stderrSpy.mock.calls.length).toEqual(1)

        stderrSpy.mockRestore()
    })
})