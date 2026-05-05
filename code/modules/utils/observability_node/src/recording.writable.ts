import {Writable} from "node:stream"

export class RecordingWritable extends Writable {
    public readonly writes: string[] = []

    _write(
        chunk: unknown,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ) {
        this.writes.push(String(chunk))
        callback()
    }

    text(): string {
        return this.writes.join("")
    }

    clear(): void {
        this.writes.length = 0
    }

    lines(): string[] {
        const text = this.text()
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trimEnd()

        return text.length === 0 ? [] : text.split("\n")
    }
}

export function recordingWritable(): RecordingWritable {
    return new RecordingWritable()
}