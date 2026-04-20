import {isErrors, isValue} from "@laoban/errors";
import {nullObservability} from "@laoban/observability";
import {renderTemplate} from "./template.engine";
import {defaultTemplateFns} from "./template.functions";
import {dollarsBracesVarDefn, mustachesVarDefn, type TemplateConfig,} from "./template.types";

type Dictionary = Record<string, unknown>;

function makeConfig(
    overrides?: Partial<TemplateConfig<Dictionary>>,
): Partial<TemplateConfig<Dictionary>> {
    return {
        variableDefn: dollarsBracesVarDefn,
        onMissing: "error",
        functions: defaultTemplateFns<Dictionary>(),
        observability: nullObservability(),
        ...overrides,
    };
}

describe("renderTemplate", () => {
    it("returns the original string when there are no tokens", () => {
        const result = renderTemplate("hello world", {}, makeConfig());

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("hello world");
    });

    it("renders a simple variable", () => {
        const dictionary = {version: "1.2.3"};
        const result = renderTemplate("version=${version}", dictionary, makeConfig());

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("version=1.2.3");
    });

    it("renders multiple variables in one template", () => {
        const dictionary = {
            version: "1.2.3",
            packageDetails: {
                name: "@laoban/template",
            },
        };

        const result = renderTemplate(
            "name=${packageDetails.name}, version=${version}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) {
            expect(result.value).toBe("name=@laoban/template, version=1.2.3");
        }
    });

    it("renders nested values", () => {
        const dictionary = {
            packageDetails: {
                guards: {
                    compile: true,
                },
            },
        };

        const result = renderTemplate(
            "compile=${packageDetails.guards.compile}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("compile=true");
    });

    it("supports quoted dotted keys", () => {
        const dictionary = {
            "package.json": {
                name: "@laoban/template",
            },
        };

        const result = renderTemplate(
            "name=${'package.json'.name}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("name=@laoban/template");
    });

    it("applies a function during rendering", () => {
        const dictionary = {
            packageDetails: {
                name: "@laoban/template",
            },
        };

        const result = renderTemplate(
            "name=${packageDetails.name|toUpperCase}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("name=@LAOBAN/TEMPLATE");
    });

    it("applies multiple functions left to right", () => {
        const dictionary = {
            module: {
                path: "one/two/three",
            },
        };

        const result = renderTemplate(
            "value=${module.path|lastSegment|toUpperCase}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("value=THREE");
    });

    it("supports alternative variable syntax when provided in config", () => {
        const dictionary = {
            packageDetails: {
                name: "@laoban/template",
            },
        };

        const result = renderTemplate(
            "Hello {{packageDetails.name}}",
            dictionary,
            makeConfig({variableDefn: mustachesVarDefn}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("Hello @laoban/template");
    });

    it("returns an error when a missing value is encountered and onMissing is error", () => {
        const result = renderTemplate(
            "value=${missing.value}",
            {},
            makeConfig({onMissing: "error"}),
        );

        expect(isErrors(result)).toBe(true);
        if (isErrors(result)) {
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].kind).toBe("missingValue");
        }
    });

    it("returns a value with warnings when a missing value is encountered and onMissing is warning", () => {
        const result = renderTemplate(
            "value=${missing.value}",
            {},
            makeConfig({onMissing: "warning"}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) {
            expect(result.value).toBe("value=");
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.[0].kind).toBe("missingValue");
            expect(result.warnings?.[0].severity).toBe("warning");
        }
    });

    it("renders empty string for missing value when onMissing is empty", () => {
        const result = renderTemplate(
            "value=${missing.value}",
            {},
            makeConfig({onMissing: "empty"}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("value=");
    });

    it("keeps the raw token for missing value when onMissing is keep", () => {
        const result = renderTemplate(
            "value=${missing.value}",
            {},
            makeConfig({onMissing: "keep"}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("value=${missing.value}");
    });

    it("stops and returns an error when one token fails", () => {
        const dictionary = {
            first: "ok",
        };

        const result = renderTemplate(
            "first=${first}, second=${missing.value}, third=${first}",
            dictionary,
            makeConfig({onMissing: "error"}),
        );

        expect(isErrors(result)).toBe(true);
        if (isErrors(result)) {
            expect(result.errors[0].kind).toBe("missingValue");
        }
    });

    it("accumulates warnings across multiple missing tokens", () => {
        const result = renderTemplate(
            "a=${missing.one}, b=${missing.two}",
            {},
            makeConfig({onMissing: "warning"}),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) {
            expect(result.value).toBe("a=, b=");
            expect(result.warnings).toHaveLength(2);
            expect(result.warnings?.map((w) => w.kind)).toEqual([
                "missingValue",
                "missingValue",
            ]);
        }
    });

    it("renders JSON for object values", () => {
        const dictionary = {
            metadata: {
                a: 1,
                b: "two",
            },
        };

        const result = renderTemplate(
            "metadata=${metadata}",
            dictionary,
            makeConfig(),
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) {
            expect(result.value).toBe(`metadata=${JSON.stringify(dictionary.metadata)}`);
        }
    });

    it("accepts Template objects as well as raw strings", () => {
        const dictionary = {version: "1.2.3"};
        const template = {raw: "version=${version}"};

        const result = renderTemplate(template, dictionary, makeConfig());

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("version=1.2.3");
    });

    it("uses defaults when config is omitted", () => {
        const dictionary = {
            packageDetails: {
                name: "@laoban/template",
            },
        };

        const result = renderTemplate(
            "Hello ${packageDetails.name|toUpperCase}",
            dictionary,
        );

        expect(isValue(result)).toBe(true);
        if (isValue(result)) expect(result.value).toBe("Hello @LAOBAN/TEMPLATE");
    });
});