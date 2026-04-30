// function.and.args.spec.ts

import {
    fromFunctionAndArgs,
    hasFunctionName,
    toFunctionAndArgs
} from "./function.and.args"

describe("toFunctionAndArgs", () => {
    it("parses a function with no args", () => {
        expect(toFunctionAndArgs("pwd()")).toEqual({
            name: "pwd",
            args: []
        })
    })

    it("parses a function with one arg", () => {
        expect(toFunctionAndArgs("mkdir(dist)")).toEqual({
            name: "mkdir",
            args: ["dist"]
        })
    })

    it("parses a function with two args", () => {
        expect(toFunctionAndArgs("cp(a,b)")).toEqual({
            name: "cp",
            args: ["a", "b"]
        })
    })

    it("allows dots in filenames", () => {
        expect(toFunctionAndArgs("cat(package.json)")).toEqual({
            name: "cat",
            args: ["package.json"]
        })
    })

    it("allows leading dots in filenames", () => {
        expect(toFunctionAndArgs("tail(.log,50)")).toEqual({
            name: "tail",
            args: [".log", "50"]
        })
    })

    it("allows dots and slashes in paths", () => {
        expect(toFunctionAndArgs("cp(coverage/coverage-final.json,/tmp/pkg.name.json)")).toEqual({
            name: "cp",
            args: ["coverage/coverage-final.json", "/tmp/pkg.name.json"]
        })
    })

    it("preserves whitespace inside args", () => {
        expect(toFunctionAndArgs("cp(a, b)")).toEqual({
            name: "cp",
            args: ["a", " b"]
        })
    })

    it("allows underscores and digits after the first character in the name", () => {
        expect(toFunctionAndArgs("rmDir2(a)")).toEqual({
            name: "rmDir2",
            args: ["a"]
        })
    })

    it("rejects text without parentheses", () => {
        expect(() => toFunctionAndArgs("pwd")).toThrow(
            "Command [pwd] does not match name(arg1,arg2,...)"
        )
    })

    it("rejects an empty function name", () => {
        expect(() => toFunctionAndArgs("(a)")).toThrow(
            "Command [(a)] does not match name(arg1,arg2,...)"
        )
    })

    it("rejects a function name starting with a digit", () => {
        expect(() => toFunctionAndArgs("1cat(a)")).toThrow(
            "Command [1cat(a)] does not match name(arg1,arg2,...)"
        )
    })

    it("rejects text with extra content after the closing parenthesis", () => {
        expect(() => toFunctionAndArgs("cat(a)b")).toThrow(
            "Command [cat(a)b] does not match name(arg1,arg2,...)"
        )
    })

    it("rejects an argument containing a closing parenthesis", () => {
        expect(() => toFunctionAndArgs("cat(a)b")).toThrow(
            "Command [cat(a)b] does not match name(arg1,arg2,...)"
        )
    })
})

describe("fromFunctionAndArgs", () => {
    it("prints a function with no args", () => {
        expect(fromFunctionAndArgs({
            name: "pwd",
            args: []
        })).toEqual("pwd()")
    })

    it("prints a function with args", () => {
        expect(fromFunctionAndArgs({
            name: "cp",
            args: ["a", "b"]
        })).toEqual("cp(a,b)")
    })

    it("prints dots in filenames", () => {
        expect(fromFunctionAndArgs({
            name: "cat",
            args: ["package.json"]
        })).toEqual("cat(package.json)")
    })
})

describe("parse/print invariant", () => {
    it.each([
        "pwd()",
        "exists(dist)",
        "mkdir(dist)",
        "rm(dist/file.txt)",
        "rmDir(dist)",
        "cat(package.json)",
        "tail(.log,50)",
        "cp(coverage/coverage-final.json,/tmp/coverage/pkg.name.json)",
        "cp(a, b)"
    ])("round-trips %s", text => {
        expect(fromFunctionAndArgs(toFunctionAndArgs(text))).toEqual(text)
    })
})

describe("hasFunctionName", () => {
    it("returns true when the name matches", () => {
        expect(hasFunctionName({
            name: "cp",
            args: ["a", "b"]
        }, "cp")).toEqual(true)
    })

    it("returns false when the name does not match", () => {
        expect(hasFunctionName({
            name: "cp",
            args: ["a", "b"]
        }, "mkdir")).toEqual(false)
    })
})