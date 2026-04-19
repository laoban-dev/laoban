import {
    colonPrefixedVarDefn,
    dollarsBracesVarDefn,
    doubleAngleVarDefn,
    makeTemplateIssue,
    mustachesVarDefn,
} from "./template.types";

function extractTokens(input: string, regex: RegExp): string[] {
    return input.match(regex) ?? [];
}

describe("template variable definitions", () => {
    it("dollarsBracesVarDefn matches and strips ${...} tokens", () => {
        const input = "x ${foo} y ${bar.baz}";
        const tokens = extractTokens(input, dollarsBracesVarDefn.regex);

        expect(tokens).toEqual(["${foo}", "${bar.baz}"]);
        expect(tokens.map(dollarsBracesVarDefn.removeStartEnd)).toEqual(["foo", "bar.baz"]);
    });

    it("mustachesVarDefn matches and strips {{...}} tokens", () => {
        const input = "{{a}} and {{b}}";
        const tokens = extractTokens(input, mustachesVarDefn.regex);

        expect(tokens).toEqual(["{{a}}", "{{b}}"]);
        expect(tokens.map(mustachesVarDefn.removeStartEnd)).toEqual(["a", "b"]);
    });

    it("colonPrefixedVarDefn matches and strips :path tokens", () => {
        const input = "id=:user.name and :version2";
        const tokens = extractTokens(input, colonPrefixedVarDefn.regex);

        expect(tokens).toEqual([":user.name", ":version2"]);
        expect(tokens.map(colonPrefixedVarDefn.removeStartEnd)).toEqual(["user.name", "version2"]);
    });

    it("doubleAngleVarDefn matches and strips <<...>> tokens", () => {
        const input = "x <<foo>> y <<bar.baz>>";
        const tokens = extractTokens(input, doubleAngleVarDefn.regex);

        expect(tokens).toEqual(["<<foo>>", "<<bar.baz>>"]);
        expect(tokens.map(doubleAngleVarDefn.removeStartEnd)).toEqual(["foo", "bar.baz"]);
    });

    it("removeStartEnd can produce empty content for empty tokens", () => {
        expect(dollarsBracesVarDefn.removeStartEnd("${}")).toBe("");
        expect(doubleAngleVarDefn.removeStartEnd("<<>>")).toBe("");
    });
});

describe("makeTemplateIssue", () => {
    it("defaults severity to error and leaves optional fields undefined", () => {
        const issue = makeTemplateIssue("invalidExpression", "Bad template");

        expect(issue).toEqual({
            kind: "invalidExpression",
            message: "Bad template",
            severity: "error",
            code: undefined,
            context: {
                expression: undefined,
                path: undefined,
                functionName: undefined,
            },
        });
    });

    it("applies severity, code, and context extras", () => {
        const issue = makeTemplateIssue("functionFailed", "Function failed", {
            expression: "name|toUpperCase",
            path: ["name"],
            functionName: "toUpperCase",
            severity: "warning",
            code: "TEMP001",
        });

        expect(issue).toEqual({
            kind: "functionFailed",
            message: "Function failed",
            severity: "warning",
            code: "TEMP001",
            context: {
                expression: "name|toUpperCase",
                path: ["name"],
                functionName: "toUpperCase",
            },
        });
    });
});

