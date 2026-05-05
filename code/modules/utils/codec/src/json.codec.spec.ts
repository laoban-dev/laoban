import { errorsOrThrow, isErrors, valueOrThrow } from "@laoban/errors"
import { mustBeObjectWithFields, mustBeString, type Validator } from "@laoban/validation"
import { recordingObservability } from "@laoban/observability"

import { jsonCodec } from "./json.codec"

type Person = {
    name: string
}

const validatePerson: Validator<Person> = mustBeObjectWithFields<Person>(
    {
        name: mustBeString,
    },
    true,
)

describe("jsonCodec", () => {
    describe("encode", () => {
        it("encodes values as pretty JSON with a trailing newline by default", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            const result = codec.encode({ name: "Phil" }, recording.observability)

            expect(valueOrThrow(result)).toBe(`{\n  "name": "Phil"\n}\n`)
        })

        it("can encode without a trailing newline", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({
                validator: validatePerson,
                trailingNewline: false,
            })

            const result = codec.encode({ name: "Phil" }, recording.observability)

            expect(valueOrThrow(result)).toBe(`{\n  "name": "Phil"\n}`)
        })

        it("can encode with custom spacing", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({
                validator: validatePerson,
                space: 0,
                trailingNewline: false,
            })

            const result = codec.encode({ name: "Phil" }, recording.observability)

            expect(valueOrThrow(result)).toBe(`{"name":"Phil"}`)
        })

        it("can encode without a validator", () => {
            const recording = recordingObservability()
            const codec = jsonCodec()

            const result = codec.encode({ name: "Phil" }, recording.observability)

            expect(valueOrThrow(result)).toBe(`{\n  "name": "Phil"\n}\n`)
        })

        it("returns a structured error when JSON.stringify returns undefined", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<undefined>()

            const result = codec.encode(undefined, recording.observability)

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "jsonCodecEncode",
                    message: "Could not encode as JSON: JSON.stringify returned undefined",
                },
            ])
        })

        it("returns a structured error when JSON.stringify throws", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<any>()

            const circular: any = {}
            circular.self = circular

            const result = codec.encode(circular, recording.observability)

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "jsonCodecEncode",
                    message: expect.stringContaining("Could not encode as JSON:"),
                },
            ])
        })

        it("records observability for successful encode", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            valueOrThrow(codec.encode({ name: "Phil" }, recording.observability))

            expect(recording.debug).toEqual([
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "encode",
                        },
                        "starting",
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "encode",
                        },
                        "finished",
                        {
                            length: 21,
                            trailingNewline: true,
                        },
                    ],
                },
            ])
        })

        it("records observability for failed encode", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<any>()

            const circular: any = {}
            circular.self = circular

            const result = codec.encode(circular, recording.observability)

            expect(isErrors(result)).toBe(true)
            expect(recording.debug).toEqual([
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "encode",
                        },
                        "starting",
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "encode",
                        },
                        "failed",
                        {
                            error: expect.any(String),
                        },
                    ],
                },
            ])
        })
    })

    describe("decode", () => {
        it("decodes valid JSON and validates it when a validator is supplied", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            const result = codec.decode(`{"name":"Phil"}`, recording.observability)

            expect(valueOrThrow(result)).toEqual({
                name: "Phil",
            })
        })

        it("decodes valid JSON without validation when no validator is supplied", () => {
            const recording = recordingObservability()
            const codec = jsonCodec()

            const result = codec.decode(`{"name":123}`, recording.observability)

            expect(valueOrThrow(result)).toEqual({
                name: 123,
            })
        })

        it("returns a structured error for invalid JSON", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            const result = codec.decode(`{ nope`, recording.observability)

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "jsonCodecDecode",
                    message: expect.stringContaining("Could not parse JSON:"),
                },
            ])
        })

        it("returns validation errors when decoded JSON fails validation and a validator is supplied", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            const result = codec.decode(`{"name":123}`, recording.observability)

            expect(isErrors(result)).toBe(true)
            expect(errorsOrThrow(result)[0].message).toContain("name")
        })
        function codecJsonDebug(recording: ReturnType<typeof recordingObservability>) {
            return recording.debug.filter(entry =>
                entry.context === "codec:json"
            )
        }
        it("records observability for successful decode with validation", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            valueOrThrow(codec.decode(`{"name":"Phil"}`, recording.observability))

            expect(codecJsonDebug(recording)).toEqual([
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "decode",
                        },
                        "starting",
                        {
                            length: 15,
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "validate",
                        },
                        "starting",
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "validate",
                        },
                        "finished",
                        {
                            warningCount: 0,
                        },
                    ],
                },
            ])
        })
        it("records observability for successful decode without validation", () => {
            const recording = recordingObservability()
            const codec = jsonCodec()

            valueOrThrow(codec.decode(`{"name":123}`, recording.observability))

            expect(recording.debug).toEqual([
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "decode",
                        },
                        "starting",
                        {
                            length: 12,
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "validate",
                        },
                        "skipped",
                    ],
                },
            ])
        })

        it("records observability for invalid JSON decode", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            const result = codec.decode(`{ nope`, recording.observability)

            expect(isErrors(result)).toBe(true)
            expect(recording.debug).toEqual([
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "decode",
                        },
                        "starting",
                        {
                            length: 6,
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "decode",
                        },
                        "failed",
                        {
                            error: expect.any(String),
                        },
                    ],
                },
            ])
        })

        it("records observability for validation failure", () => {
            const recording = recordingObservability()
            const codec = jsonCodec<Person>({ validator: validatePerson })

            const result = codec.decode(`{"name":123}`, recording.observability)

            expect(isErrors(result)).toBe(true)
            expect(codecJsonDebug(recording)).toEqual([
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "decode",
                        },
                        "starting",
                        {
                            length: 12,
                        },
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "validate",
                        },
                        "starting",
                    ],
                },
                {
                    moduleScope: {
                        module: undefined,
                        directory: ".",
                    },
                    debugName: ["codec", "json"],
                    context: "codec:json",
                    level: "debug",
                    msg: [
                        {
                            action: "validate",
                        },
                        "failed",
                        {
                            errorCount: 1,
                            warningCount: 0,
                        },
                    ],
                },
            ])
        })
    })
})