import {Writable} from "node:stream"

import {
    RecordingWritable,
    recordingWritable,
} from "./recording.writable"

function writeToWritable(
    writable: Writable,
    chunk: string | Buffer,
): Promise<void> {
    return new Promise((resolve, reject) => {
        writable.write(chunk, error => {
            if (error) reject(error)
            else resolve()
        })
    })
}

describe("RecordingWritable", () => {
    it("is a node Writable stream", () => {
        const writable = new RecordingWritable()

        expect(writable).toBeInstanceOf(Writable)
    })

    it("records written strings", async () => {
        const writable = new RecordingWritable()

        await writeToWritable(writable, "hello")
        await writeToWritable(writable, " ")
        await writeToWritable(writable, "world")

        expect(writable.writes).toEqual([
            "hello",
            " ",
            "world",
        ])
        expect(writable.text()).toEqual("hello world")
    })

    it("records buffers as strings", async () => {
        const writable = new RecordingWritable()

        await writeToWritable(writable, Buffer.from("hello"))
        await writeToWritable(writable, Buffer.from(" world"))

        expect(writable.writes).toEqual([
            "hello",
            " world",
        ])
        expect(writable.text()).toEqual("hello world")
    })

    it("normalises line endings", async () => {
        const writable = new RecordingWritable()

        await writeToWritable(writable, "one\r\ntwo\rthree\n")
        await writeToWritable(writable, "four")

        expect(writable.lines()).toEqual([
            "one",
            "two",
            "three",
            "four",
        ])
    })

    it("preserves interior blank lines", async () => {
        const writable = new RecordingWritable()

        await writeToWritable(writable, "one\n\n")
        await writeToWritable(writable, "two\n")

        expect(writable.lines()).toEqual([
            "one",
            "",
            "two",
        ])
    })

    it("drops trailing blank lines caused by final newlines", async () => {
        const writable = new RecordingWritable()

        await writeToWritable(writable, "one\n")
        await writeToWritable(writable, "two\n\n")

        expect(writable.lines()).toEqual([
            "one",
            "two",
        ])
    })

    it("returns no lines for empty output", () => {
        const writable = new RecordingWritable()

        expect(writable.text()).toEqual("")
        expect(writable.lines()).toEqual([])
    })

    it("can be cleared", async () => {
        const writable = new RecordingWritable()

        await writeToWritable(writable, "before")

        writable.clear()

        expect(writable.writes).toEqual([])
        expect(writable.text()).toEqual("")
        expect(writable.lines()).toEqual([])
    })

    it("factory creates a RecordingWritable", () => {
        const writable = recordingWritable()

        expect(writable).toBeInstanceOf(RecordingWritable)
        expect(writable).toBeInstanceOf(Writable)
        expect(writable.text()).toEqual("")
    })
})