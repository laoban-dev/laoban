import type { ErrorsOr } from "@laoban/errors"
import { errors, isErrors, value } from "@laoban/errors"
import type { Observability } from "@laoban/observability"
import type { Validator } from "@laoban/validation"

import type { ICodec } from "./codec"

export type JsonCodecDebugArea = readonly ["codec", "json"]

const jsonCodecDebug: JsonCodecDebugArea = ["codec", "json"]

export type JsonCodecOptions<T> = Readonly<{
    validator?: Validator<T>
    space?: string | number
    trailingNewline?: boolean
}>

const defaultJsonCodecOptions: Required<Omit<JsonCodecOptions<unknown>, "validator">> = {
    space: 2,
    trailingNewline: true,
}

function withTrailingNewline(
    text: string,
    trailingNewline: boolean,
): string {
    return trailingNewline ? `${text}\n` : text
}

function debug(
    observability: Observability,
    action: "encode" | "decode" | "validate",
    ...msg: unknown[]
): void {
    observability.debug(jsonCodecDebug, "debug", { action }, ...msg)
}

export function jsonCodec<T = unknown>(
    options: JsonCodecOptions<T> = {},
): ICodec<T> {
    const resolvedOptions = {
        ...defaultJsonCodecOptions,
        ...options,
    }

    return {
        encode: (t: T, observability: Observability): ErrorsOr<string> => {
            debug(observability, "encode", "starting")

            try {
                const encoded = JSON.stringify(t, null, resolvedOptions.space)

                if (encoded === undefined) {
                    return errors({
                        kind: "jsonCodecEncode",
                        message: "Could not encode as JSON: JSON.stringify returned undefined",
                    })
                }

                const result = withTrailingNewline(encoded, resolvedOptions.trailingNewline)

                debug(observability, "encode", "finished", {
                    length: result.length,
                    trailingNewline: resolvedOptions.trailingNewline,
                })

                return value(result)
            } catch (e: unknown) {
                debug(observability, "encode", "failed", {
                    error: e instanceof Error ? e.message : String(e),
                })

                return errors({
                    kind: "jsonCodecEncode",
                    message: `Could not encode as JSON: ${e instanceof Error ? e.message : String(e)}`,
                })
            }
        },

        decode: (s: string, observability: Observability): ErrorsOr<T> => {
            debug(observability, "decode", "starting", {
                length: s.length,
            })

            let parsed: unknown

            try {
                parsed = JSON.parse(s)
            } catch (e: unknown) {
                debug(observability, "decode", "failed", {
                    error: e instanceof Error ? e.message : String(e),
                })

                return errors({
                    kind: "jsonCodecDecode",
                    message: `Could not parse JSON: ${e instanceof Error ? e.message : String(e)}`,
                })
            }

            if (resolvedOptions.validator === undefined) {
                debug(observability, "validate", "skipped")
                return value(parsed as T)
            }

            debug(observability, "validate", "starting")

            const validated = resolvedOptions.validator(["jsonCodec", "decode"], observability)(parsed as T)
            if (isErrors(validated)) {
                debug(observability, "validate", "failed", {
                    errorCount: validated.errors.length,
                    warningCount: validated.warnings?.length ?? 0,
                })

                return validated
            }

            debug(observability, "validate", "finished", {
                warningCount: validated.warnings?.length ?? 0,
            })

            return value(validated.value, validated.warnings)
        },
    }
}