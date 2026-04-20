import {isValue} from "@laoban/errors";
import {nullObservability} from "@laoban/observability";
import {defaultTemplateFns} from "./template.functions";
import {dollarsBracesVarDefn, type TemplateConfig,} from "./template.types";

type Dictionary = Record<string, unknown>;

type BuiltInFnName =
    | "urlEncode"
    | "lastSegment"
    | "forwardSlashToDot"
    | "toLowerCase"
    | "toUpperCase"
    | "toTitleCase"
    | "toFirstUpper"
    | "toSnakeCase"
    | "toPackage"
    | "default";

const makeConfig = (
    functions = defaultTemplateFns<Dictionary>(),
): TemplateConfig<Dictionary> => ({
    variableDefn: dollarsBracesVarDefn,
    onMissing: "error",
    functions,
    observability: nullObservability(),
});

function invokeFunction(
    functionName: BuiltInFnName,
    inputValue: unknown,
    params: string[] = [],
): unknown {
    const functions = defaultTemplateFns<Dictionary>();
    const fn = functions[functionName];

    const result = fn({
        value: inputValue,
        dictionary: {},
        params,
        expression: `value|${functionName}`,
        functionName,
        config: makeConfig(functions),
    });

    expect(isValue(result)).toBe(true);
    if (!isValue(result)) {
        throw new Error(`Expected ${functionName} to return value result`);
    }

    return result.value;
}

describe("defaultTemplateFns", () => {
    it("urlEncode encodes reserved URL characters", () => {
        expect(invokeFunction("urlEncode", "a b/c")).toBe("a%20b%2Fc");
    });

    it("lastSegment returns the final non-empty slash-delimited segment", () => {
        expect(invokeFunction("lastSegment", "one/two/three/")).toBe("three");
    });

    it("forwardSlashToDot replaces all forward slashes with dots", () => {
        expect(invokeFunction("forwardSlashToDot", "one/two/three")).toBe("one.two.three");
    });

    it("toLowerCase lowercases the input string", () => {
        expect(invokeFunction("toLowerCase", "AbC")).toBe("abc");
    });

    it("toUpperCase uppercases the input string", () => {
        expect(invokeFunction("toUpperCase", "AbC")).toBe("ABC");
    });

    it("toTitleCase title-cases each word", () => {
        expect(invokeFunction("toTitleCase", "hELLo woRLD")).toBe("Hello World");
    });

    it("toFirstUpper uppercases only the first character", () => {
        expect(invokeFunction("toFirstUpper", "hello")).toBe("Hello");
    });

    it("toFirstUpper keeps empty strings unchanged", () => {
        expect(invokeFunction("toFirstUpper", "")).toBe("");
    });

    it("toSnakeCase converts lowerCamelCase to snake_case", () => {
        expect(invokeFunction("toSnakeCase", "helloWorld")).toBe("hello_world");
    });

    it("toPackage converts dot-separated package names to slash-separated paths", () => {
        expect(invokeFunction("toPackage", "one.two.three")).toBe("one/two/three");
    });

    it("default returns fallback when value is undefined", () => {
        expect(invokeFunction("default", undefined, ["fallback"])).toBe("fallback");
    });

    it("default returns fallback when value is null", () => {
        expect(invokeFunction("default", null, ["fallback"])).toBe("fallback");
    });

    it("default keeps empty string instead of fallback", () => {
        expect(invokeFunction("default", "", ["fallback"])).toBe("");
    });

    it("default keeps zero instead of fallback", () => {
        expect(invokeFunction("default", 0, ["fallback"])).toBe(0);
    });

    it("default keeps false instead of fallback", () => {
        expect(invokeFunction("default", false, ["fallback"])).toBe(false);
    });

    it("default without params returns undefined for undefined input", () => {
        expect(invokeFunction("default", undefined)).toBeUndefined();
    });

    it("stringifies non-string values for transformations", () => {
        expect(invokeFunction("toUpperCase", 123)).toBe("123");
        expect(invokeFunction("toLowerCase", true)).toBe("true");
    });
});


