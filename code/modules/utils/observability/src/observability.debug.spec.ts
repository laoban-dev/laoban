// observability.debug.test.ts

import {errorsOrThrow, valueOrThrow} from "@laoban/errors"
import {
    addDebugName,
    debugNameStartsWith,
    DebugConfig,
    emptyDebugConfig,
    parseDebugConfig,
    parseDebugName,
    renderDebugName,
    shouldDebug,
} from "./observability.debug"

describe("observability.debug", () => {
    describe("parseDebugName", () => {
        it("parses a single-part debug name", () => {
            expect(valueOrThrow(parseDebugName("script"))).toEqual(["script"])
        })

        it("parses a multi-part debug name", () => {
            expect(valueOrThrow(parseDebugName("template:parse:tokens"))).toEqual([
                "template",
                "parse",
                "tokens",
            ])
        })

        it("trims each part", () => {
            expect(valueOrThrow(parseDebugName(" template : parse "))).toEqual([
                "template",
                "parse",
            ])
        })

        it("rejects an empty debug name", () => {
            expect(errorsOrThrow(parseDebugName(""))).toEqual([
                {
                    kind: "emptyDebugArea",
                    message: "Debug name cannot be empty",
                    context: {
                        raw: "",
                    },
                },
            ])
        })

        it("rejects a whitespace-only debug name", () => {
            expect(errorsOrThrow(parseDebugName("   "))).toEqual([
                {
                    kind: "emptyDebugArea",
                    message: "Debug name cannot be empty",
                    context: {
                        raw: "   ",
                    },
                },
            ])
        })

        it("rejects an empty middle segment", () => {
            expect(errorsOrThrow(parseDebugName("template::parse"))).toEqual([
                {
                    kind: "emptyDebugNamePart",
                    message: "Debug name 'template::parse' contains an empty ':' segment",
                    context: {
                        raw: "template::parse",
                    },
                },
            ])
        })

        it("rejects an empty first segment", () => {
            expect(errorsOrThrow(parseDebugName(":template"))).toEqual([
                {
                    kind: "emptyDebugNamePart",
                    message: "Debug name ':template' contains an empty ':' segment",
                    context: {
                        raw: ":template",
                    },
                },
            ])
        })

        it("rejects an empty final segment", () => {
            expect(errorsOrThrow(parseDebugName("template:"))).toEqual([
                {
                    kind: "emptyDebugNamePart",
                    message: "Debug name 'template:' contains an empty ':' segment",
                    context: {
                        raw: "template:",
                    },
                },
            ])
        })
    })

    describe("renderDebugName", () => {
        it("renders a single-part debug name", () => {
            expect(renderDebugName(["script"])).toEqual("script")
        })

        it("renders a multi-part debug name", () => {
            expect(renderDebugName(["template", "parse", "tokens"])).toEqual(
                "template:parse:tokens",
            )
        })
    })

    describe("debugNameStartsWith", () => {
        it("matches equal names", () => {
            expect(debugNameStartsWith(["template", "parse"], ["template", "parse"])).toBe(true)
        })

        it("matches child names", () => {
            expect(debugNameStartsWith(
                ["template", "parse", "tokens"],
                ["template", "parse"],
            )).toBe(true)
        })

        it("does not match parents", () => {
            expect(debugNameStartsWith(["template"], ["template", "parse"])).toBe(false)
        })

        it("does not match siblings", () => {
            expect(debugNameStartsWith(["template", "render"], ["template", "parse"])).toBe(false)
        })

        it("does not do string-prefix matching", () => {
            expect(debugNameStartsWith(["scripted"], ["script"])).toBe(false)
        })

        it("treats an empty configured name as matching everything", () => {
            expect(debugNameStartsWith(["anything"], [])).toBe(true)
        })
    })

    describe("addDebugName", () => {
        it("adds a whole area when there are no child parts", () => {
            expect(addDebugName(emptyDebugConfig, "debug", ["script"])).toEqual({
                script: {
                    debug: [],
                },
            })
        })

        it("adds a child path under an area", () => {
            expect(addDebugName(emptyDebugConfig, "debug", ["template", "parse"])).toEqual({
                template: {
                    debug: [["parse"]],
                },
            })
        })

        it("adds a deeper child path under an area", () => {
            expect(addDebugName(emptyDebugConfig, "debug", ["template", "parse", "tokens"])).toEqual({
                template: {
                    debug: [["parse", "tokens"]],
                },
            })
        })

        it("keeps multiple child paths for the same area and level", () => {
            const result = addDebugName(
                addDebugName(emptyDebugConfig, "debug", ["template", "parse"]),
                "debug",
                ["template", "render"],
            )

            expect(result).toEqual({
                template: {
                    debug: [["parse"], ["render"]],
                },
            })
        })

        it("keeps separate levels for the same area", () => {
            const result = addDebugName(
                addDebugName(emptyDebugConfig, "debug", ["template", "parse"]),
                "info",
                ["template", "render"],
            )

            expect(result).toEqual({
                template: {
                    debug: [["parse"]],
                    info: [["render"]],
                },
            })
        })

        it("whole area wins over an existing child path", () => {
            const result = addDebugName(
                addDebugName(emptyDebugConfig, "debug", ["script", "type1"]),
                "debug",
                ["script"],
            )

            expect(result).toEqual({
                script: {
                    debug: [],
                },
            })
        })

        it("existing whole area wins over a later child path", () => {
            const result = addDebugName(
                addDebugName(emptyDebugConfig, "debug", ["script"]),
                "debug",
                ["script", "type1"],
            )

            expect(result).toEqual({
                script: {
                    debug: [],
                },
            })
        })

        it("does not mutate the existing config", () => {
            const original: DebugConfig = {
                template: {
                    debug: [["parse"]],
                },
            }

            const result = addDebugName(original, "debug", ["script"])

            expect(original).toEqual({
                template: {
                    debug: [["parse"]],
                },
            })

            expect(result).toEqual({
                template: {
                    debug: [["parse"]],
                },
                script: {
                    debug: [],
                },
            })
        })
    })

    describe("shouldDebug", () => {
        it("returns false for an empty config", () => {
            expect(shouldDebug(emptyDebugConfig, ["script"], "debug")).toBe(false)
        })

        it("matches a whole area", () => {
            const config: DebugConfig = {
                script: {
                    debug: [],
                },
            }

            expect(shouldDebug(config, ["script"], "debug")).toBe(true)
            expect(shouldDebug(config, ["script", "type1"], "debug")).toBe(true)
            expect(shouldDebug(config, ["script", "type2"], "debug")).toBe(true)
            expect(shouldDebug(config, ["script", "type1", "detail"], "debug")).toBe(true)
        })

        it("matches only configured child paths", () => {
            const config: DebugConfig = {
                template: {
                    debug: [["parse"]],
                },
            }

            expect(shouldDebug(config, ["template"], "debug")).toBe(false)
            expect(shouldDebug(config, ["template", "parse"], "debug")).toBe(true)
            expect(shouldDebug(config, ["template", "parse", "tokens"], "debug")).toBe(true)
            expect(shouldDebug(config, ["template", "render"], "debug")).toBe(false)
        })

        it("does not match sibling areas", () => {
            const config: DebugConfig = {
                script: {
                    debug: [],
                },
            }

            expect(shouldDebug(config, ["template"], "debug")).toBe(false)
            expect(shouldDebug(config, ["template", "parse"], "debug")).toBe(false)
        })

        it("respects levels", () => {
            const config: DebugConfig = {
                script: {
                    info: [],
                },
                template: {
                    debug: [["parse"]],
                },
            }

            expect(shouldDebug(config, ["script"], "debug")).toBe(false)
            expect(shouldDebug(config, ["script"], "info")).toBe(true)

            expect(shouldDebug(config, ["template", "parse"], "debug")).toBe(true)
            expect(shouldDebug(config, ["template", "parse"], "info")).toBe(false)
        })

        it("returns false for an empty debug name", () => {
            const config: DebugConfig = {
                script: {
                    debug: [],
                },
            }

            expect(shouldDebug(config, [], "debug")).toBe(false)
        })
    })

    describe("parseDebugConfig", () => {
        it("returns an empty config for undefined", () => {
            expect(valueOrThrow(parseDebugConfig(undefined))).toEqual({})
        })

        it("returns an empty config for an empty string", () => {
            expect(valueOrThrow(parseDebugConfig(""))).toEqual({})
        })

        it("returns an empty config for whitespace", () => {
            expect(valueOrThrow(parseDebugConfig("   "))).toEqual({})
        })

        it("parses the intended command-line shape", () => {
            expect(valueOrThrow(parseDebugConfig("script,template:parse"))).toEqual({
                script: {
                    debug: [],
                },
                template: {
                    debug: [["parse"]],
                },
            })
        })

        it("trims comma-separated entries and name parts", () => {
            expect(valueOrThrow(parseDebugConfig(" script , template : parse "))).toEqual({
                script: {
                    debug: [],
                },
                template: {
                    debug: [["parse"]],
                },
            })
        })

        it("ignores empty comma entries", () => {
            expect(valueOrThrow(parseDebugConfig("script,,template:parse,"))).toEqual({
                script: {
                    debug: [],
                },
                template: {
                    debug: [["parse"]],
                },
            })
        })

        it("uses the supplied level", () => {
            expect(valueOrThrow(parseDebugConfig("script,template:parse", "info"))).toEqual({
                script: {
                    info: [],
                },
                template: {
                    info: [["parse"]],
                },
            })
        })

        it("lets whole area win when it appears after a child path", () => {
            expect(valueOrThrow(parseDebugConfig("script:type1,script"))).toEqual({
                script: {
                    debug: [],
                },
            })
        })

        it("lets whole area win when it appears before a child path", () => {
            expect(valueOrThrow(parseDebugConfig("script,script:type1"))).toEqual({
                script: {
                    debug: [],
                },
            })
        })

        it("keeps multiple children for the same area", () => {
            expect(valueOrThrow(parseDebugConfig("template:parse,template:render"))).toEqual({
                template: {
                    debug: [["parse"], ["render"]],
                },
            })
        })

        it("returns an error for malformed colon syntax", () => {
            expect(errorsOrThrow(parseDebugConfig("template::parse"))).toEqual([
                {
                    kind: "emptyDebugNamePart",
                    message: "Debug name 'template::parse' contains an empty ':' segment",
                    context: {
                        raw: "template::parse",
                        entry: "template::parse",
                    },
                },
            ])
        })

        it("collects multiple malformed entries", () => {
            expect(errorsOrThrow(parseDebugConfig("template::parse,:script,valid"))).toEqual([
                {
                    kind: "emptyDebugNamePart",
                    message: "Debug name 'template::parse' contains an empty ':' segment",
                    context: {
                        raw: "template::parse,:script,valid",
                        entry: "template::parse",
                    },
                },
                {
                    kind: "emptyDebugNamePart",
                    message: "Debug name ':script' contains an empty ':' segment",
                    context: {
                        raw: "template::parse,:script,valid",
                        entry: ":script",
                    },
                },
            ])
        })
    })
})