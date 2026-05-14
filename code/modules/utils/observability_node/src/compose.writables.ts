import {Writable} from "stream"
import {makeErrorFromException} from "@laoban/errors"
import {ComposeWritables, ErrorsFn} from "@laoban/observability"
import {NodeWriteChannel} from "./observability.node";


const toError = (e: unknown): Error =>
    e instanceof Error ? e : new Error(String(e))

const writeIssueToStdErr: ErrorsFn = issue => {
    const message =
        issue instanceof Error
            ? issue.stack ?? issue.message
            : JSON.stringify(issue, null, 2)

    process.stderr.write(`${message}\n`)
}

export const composeNodeWritables: ComposeWritables<NodeWriteChannel> = (
    channels,
    onError = writeIssueToStdErr,
): Writable => {
    const errorHandlers: { channel: Writable; handler: (error: Error) => void }[] = []

    const composed = new Writable({
        autoDestroy: true,

        write(chunk, encoding, callback) {
            let pending = channels.length
            let completed = false

            if (pending === 0) {
                callback()
                return
            }

            const fail = (message: string, err: Error) => {
                if (completed) return

                completed = true

                onError(makeErrorFromException(message, err))

                callback(err)
            }

            const completeOnce = (err?: Error | null) => {
                if (completed) return

                if (err) {
                    fail("composed writable write failed", err)
                    return
                }

                pending--
                if (pending === 0) {
                    completed = true
                    callback()
                }
            }

            for (const channel of channels) {
                if (completed) return

                try {
                    channel.write(chunk, encoding, completeOnce)
                } catch (e) {
                    fail("composed writable write threw", toError(e))
                    return
                }
            }
        },

        final(callback) {
            callback()
        },

        destroy(error, callback) {
            for (const {channel, handler} of errorHandlers)
                channel.off("error", handler)

            callback(error)
        },
    })

    for (const channel of channels) {
        const handler = (error: Error) => {
            onError(
                makeErrorFromException(
                    "composed writable child stream error",
                    error,
                ),
            )

            composed.destroy(error)
        }

        channel.on("error", handler)
        errorHandlers.push({channel, handler})
    }

    return composed
}