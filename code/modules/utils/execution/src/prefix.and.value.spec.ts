// prefix.and.value.spec.ts

import {
    defaultPrefixAndValueOptions,
    fromPrefixAndValue,
    hasPrefix,
    PrefixAndValue,
    PrefixAndValueOptions,
    toPrefixAndValue
} from "./prefix.and.value"

describe("toPrefixAndValue", () => {
    it("uses the prefix before the first separator", () => {
        expect(toPrefixAndValue("js:1 + 2", {defaultPrefix: "script"})).toEqual({
            prefix: "js",
            value: "1 + 2",
            explicitPrefix: true
        })
    })

    it("uses the default prefix when there is no separator", () => {
        expect(toPrefixAndValue("tsc --noEmit", {defaultPrefix: "script"})).toEqual({
            prefix: "script",
            value: "tsc --noEmit",
            explicitPrefix: false
        })
    })

    it("uses the first separator only", () => {
        expect(toPrefixAndValue("file:cat(a:b:c)", {defaultPrefix: "script"})).toEqual({
            prefix: "file",
            value: "cat(a:b:c)",
            explicitPrefix: true
        })
    })

    it("supports a custom separator", () => {
        expect(toPrefixAndValue("js=>1 + 2", {
            defaultPrefix: "script",
            separator: "=>"
        })).toEqual({
            prefix: "js",
            value: "1 + 2",
            explicitPrefix: true
        })
    })

    it("uses the configured default prefix with a custom separator when no separator exists", () => {
        expect(toPrefixAndValue("tsc --noEmit", {
            defaultPrefix: "shell",
            separator: "=>"
        })).toEqual({
            prefix: "shell",
            value: "tsc --noEmit",
            explicitPrefix: false
        })
    })

    it("uses defaultPrefixAndValueOptions when options are omitted", () => {
        expect(toPrefixAndValue("tsc --noEmit")).toEqual({
            prefix: defaultPrefixAndValueOptions.defaultPrefix,
            value: "tsc --noEmit",
            explicitPrefix: false
        })
    })

    it("allows an empty value after an explicit prefix", () => {
        expect(toPrefixAndValue("js:", {defaultPrefix: "script"})).toEqual({
            prefix: "js",
            value: "",
            explicitPrefix: true
        })
    })

    it("allows an empty prefix when the separator is first", () => {
        expect(toPrefixAndValue(":value", {defaultPrefix: "script"})).toEqual({
            prefix: "",
            value: "value",
            explicitPrefix: true
        })
    })

    it("allows an empty input and treats it as an unprefixed value", () => {
        expect(toPrefixAndValue("", {defaultPrefix: "script"})).toEqual({
            prefix: "script",
            value: "",
            explicitPrefix: false
        })
    })
})

describe("fromPrefixAndValue", () => {
    it("prints an explicitly prefixed value with the separator", () => {
        const prefixAndValue: PrefixAndValue = {
            prefix: "js",
            value: "1 + 2",
            explicitPrefix: true
        }

        expect(fromPrefixAndValue(prefixAndValue, {defaultPrefix: "script"}))
            .toEqual("js:1 + 2")
    })

    it("prints an unprefixed value without adding the default prefix", () => {
        const prefixAndValue: PrefixAndValue = {
            prefix: "script",
            value: "tsc --noEmit",
            explicitPrefix: false
        }

        expect(fromPrefixAndValue(prefixAndValue, {defaultPrefix: "script"}))
            .toEqual("tsc --noEmit")
    })

    it("uses a custom separator when the prefix was explicit", () => {
        const prefixAndValue: PrefixAndValue = {
            prefix: "js",
            value: "1 + 2",
            explicitPrefix: true
        }

        expect(fromPrefixAndValue(prefixAndValue, {
            defaultPrefix: "script",
            separator: "=>"
        })).toEqual("js=>1 + 2")
    })

    it("ignores the separator when the prefix was not explicit", () => {
        const prefixAndValue: PrefixAndValue = {
            prefix: "script",
            value: "tsc --noEmit",
            explicitPrefix: false
        }

        expect(fromPrefixAndValue(prefixAndValue, {
            defaultPrefix: "script",
            separator: "=>"
        })).toEqual("tsc --noEmit")
    })

    it("uses defaultPrefixAndValueOptions when options are omitted", () => {
        const prefixAndValue: PrefixAndValue = {
            prefix: defaultPrefixAndValueOptions.defaultPrefix,
            value: "tsc --noEmit",
            explicitPrefix: false
        }

        expect(fromPrefixAndValue(prefixAndValue)).toEqual("tsc --noEmit")
    })
})

describe("parse/print invariant", () => {
    const cases: Array<{
        name: string
        text: string
        options: PrefixAndValueOptions
    }> = [
        {
            name: "explicit js prefix",
            text: "js:1 + 2",
            options: {defaultPrefix: "script"}
        },
        {
            name: "explicit file prefix",
            text: "file:cat(a:b:c)",
            options: {defaultPrefix: "script"}
        },
        {
            name: "unprefixed shell command",
            text: "tsc --noEmit",
            options: {defaultPrefix: "script"}
        },
        {
            name: "empty string",
            text: "",
            options: {defaultPrefix: "script"}
        },
        {
            name: "empty explicit value",
            text: "js:",
            options: {defaultPrefix: "script"}
        },
        {
            name: "empty explicit prefix",
            text: ":value",
            options: {defaultPrefix: "script"}
        },
        {
            name: "custom separator with explicit prefix",
            text: "js=>1 + 2",
            options: {defaultPrefix: "script", separator: "=>"}
        },
        {
            name: "custom separator without explicit prefix",
            text: "tsc --noEmit",
            options: {defaultPrefix: "script", separator: "=>"}
        }
    ]

    it.each(cases)("round-trips $name", ({text, options}) => {
        expect(fromPrefixAndValue(toPrefixAndValue(text, options), options))
            .toEqual(text)
    })
})

describe("hasPrefix", () => {
    it("returns true when the prefix matches", () => {
        expect(hasPrefix({
            prefix: "file",
            value: "rm(dist)",
            explicitPrefix: true
        }, "file")).toEqual(true)
    })

    it("returns false when the prefix does not match", () => {
        expect(hasPrefix({
            prefix: "file",
            value: "rm(dist)",
            explicitPrefix: true
        }, "js")).toEqual(false)
    })

    it("works for defaulted prefixes", () => {
        expect(hasPrefix({
            prefix: "script",
            value: "tsc --noEmit",
            explicitPrefix: false
        }, "script")).toEqual(true)
    })
})