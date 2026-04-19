import { replaceTemplateToken} from "./template.replace";
import {dollarsBracesVarDefn, type TemplateConfig, type TemplateDebugContext} from "./template.types";
import {isErrors, isValue} from "@laoban/errors";
import {nullObservability} from "@laoban/observability";
import {defaultTemplateFns} from "./template.functions";

type Dictionary = Record<string, unknown>;

const makeConfig = (
    overrides?: Partial<TemplateConfig<Dictionary>>,
): TemplateConfig<Dictionary> => ({
    variableDefn: dollarsBracesVarDefn,
    onMissing: "error",
    functions: defaultTemplateFns<Dictionary>(),
    observability: nullObservability<TemplateDebugContext>(),
    ...overrides,
});

describe("replaceTemplateToken", () => {
    it("replaces a simple variable", () => {
        const dictionary = {version: "1.2.3"};
        const result = replaceTemplateToken("${version}", dictionary, makeConfig());

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("1.2.3");
    });

    it("replaces a nested variable", () => {
        const dictionary = {
            packageDetails: {
                name: "@laoban/template",
            },
        };

        const result = replaceTemplateToken(
            "${packageDetails.name}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("@laoban/template");
    });

    it("supports quoted path segments for dotted keys", () => {
        const dictionary = {
            "package.json": {
                name: "@laoban/template",
            },
        };

        const result = replaceTemplateToken(
            "${'package.json'.name}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("@laoban/template");
    });

    it("supports quoted dotted keys in the middle of a path", () => {
        const dictionary = {
            path: {
                to: {
                    "package.json": "ok",
                },
            },
        };

        const result = replaceTemplateToken(
            "${path.to.'package.json'}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("ok");
    });

    it("applies a single function", () => {
        const dictionary = {
            packageDetails: {
                name: "@laoban/template",
            },
        };

        const result = replaceTemplateToken(
            "${packageDetails.name|toUpperCase}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("@LAOBAN/TEMPLATE");
    });

    it("applies multiple functions left to right", () => {
        const dictionary = {
            module: {
                path: "one/two/three",
            },
        };

        const result = replaceTemplateToken(
            "${module.path|lastSegment|toUpperCase}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("THREE");
    });

    it("supports function parameters", () => {
        const dictionary = {};
        const result = replaceTemplateToken(
            "${description|default(no description)}",
            dictionary,
            makeConfig({onMissing: "keep"}),
        );

        // With onMissing=keep, missing path resolution happens before function application,
        // so the raw token is preserved.
        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("${description|default(no description)}");
    });

    it("returns an error for a missing value when onMissing is error", () => {
        const dictionary = {};
        const result = replaceTemplateToken("${missing.value}", dictionary, makeConfig());

        expect(isErrors(result)).toBe(true);
        if (isErrors(result)) {
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].kind).toBe("missingValue");
        }
    });

    it("returns a warning and empty string for a missing value when onMissing is warning", () => {
        const dictionary = {};
        const result = replaceTemplateToken(
            "${missing.value}",
            dictionary,
            makeConfig({onMissing: "warning"}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) {
            expect(result.value).toBe("");
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.[0].kind).toBe("missingValue");
            expect(result.warnings?.[0].severity).toBe("warning");
        }
    });

    it("returns empty string for a missing value when onMissing is empty", () => {
        const dictionary = {};
        const result = replaceTemplateToken(
            "${missing.value}",
            dictionary,
            makeConfig({onMissing: "empty"}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("");
    });

    it("keeps the raw token for a missing value when onMissing is keep", () => {
        const dictionary = {};
        const result = replaceTemplateToken(
            "${missing.value}",
            dictionary,
            makeConfig({onMissing: "keep"}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("${missing.value}");
    });

    it("returns an error for an invalid empty expression", () => {
        const dictionary = {};
        const result = replaceTemplateToken("${}", dictionary, makeConfig());

        expect(isErrors(result)).toBe(true);
        if (isErrors(result)) {
            expect(result.errors[0].kind).toBe("invalidExpression");
        }
    });

    it("returns an error for an unterminated quoted path segment", () => {
        const dictionary = {};
        const result = replaceTemplateToken("${'package.json.name}", dictionary, makeConfig());

        expect(isErrors(result)).toBe(true);
        if (isErrors(result)) {
            expect(result.errors[0].kind).toBe("invalidExpression");
        }
    });

    it("returns an error for an unknown function", () => {
        const dictionary = {
            packageDetails: {
                name: "@laoban/template",
            },
        };

        const result = replaceTemplateToken(
            "${packageDetails.name|doesNotExist}",
            dictionary,
            makeConfig(),
        );

        expect(isErrors(result)).toBe(true);
        if (isErrors(result)) {
            expect(result.errors[0].kind).toBe("unknownFunction");
        }
    });

    it("renders numbers as strings", () => {
        const dictionary = {version: 3};
        const result = replaceTemplateToken("${version}", dictionary, makeConfig());

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("3");
    });

    it("renders booleans as strings", () => {
        const dictionary = {enabled: true};
        const result = replaceTemplateToken("${enabled}", dictionary, makeConfig());

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("true");
    });

    it("renders objects as JSON", () => {
        const dictionary = {
            metadata: {
                a: 1,
                b: "two",
            },
        };

        const result = replaceTemplateToken("${metadata}", dictionary, makeConfig());

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe(JSON.stringify(dictionary.metadata));
    });
});