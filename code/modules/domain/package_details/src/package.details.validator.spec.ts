import {isErrors, value, type ErrorsOr} from "@laoban/errors";
import {type ValidationIssue} from "@laoban/validation";
import {
    defaultObservabilityContext,
    fixedTimeService,
    makeObservability,
    nullLog,
    type Observability,
} from "@laoban/observability";
import {validatePackageDetails} from "./package.details.validator";
import {type PackageDetails} from "./package.details";

function makeObservabilityForTest(): Observability {
    return makeObservability({
        context: {
            ...defaultObservabilityContext("test-correlation-id"),
            timeService: fixedTimeService(0),
        },
        target: {
            write: nullLog,
        },
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
    });
}

function issuesOf<T>(result: ErrorsOr<T, ValidationIssue>): ValidationIssue[] {
    return isErrors(result) ? result.errors : [];
}

describe("validatePackageDetails", () => {
    test("accepts minimal package details", () => {
        const details: PackageDetails = {
            template: "typescript",
            name: "@laoban/example"
        };

        expect(validatePackageDetails([], makeObservabilityForTest())(details)).toEqual(value(details));
    });

    test("accepts full package details", () => {
        const details: PackageDetails = {
            template: "typescript",
            name: "@laoban/example",
            description: "example package",
            links: ["@laoban/a"],
            devLinks: ["@laoban/test"],
            peerLinks: ["react"],
            guards: {
                compile: true,
                test: false
            },
            files: {
                "package.json": {
                    scripts: {
                        test: "jest"
                    }
                },
                "tsconfig.json": {
                    extends: "../../tsconfig.base.json"
                }
            },
            meta: {
                owner: "team-a"
            }
        };

        expect(validatePackageDetails([], makeObservabilityForTest())(details)).toEqual(value(details));
    });

    test("rejects missing template", () => {
        const details = {
            name: "@laoban/example"
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["template"],
                message: "template is required but was undefined",
                code: "required"
            }
        ]);
    });

    test("rejects missing name", () => {
        const details = {
            template: "typescript"
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["name"],
                message: "name is required but was undefined",
                code: "required"
            }
        ]);
    });

    test("rejects blank template", () => {
        const details = {
            template: "   ",
            name: "@laoban/example"
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["template"],
                message: "template must not be blank",
                code: "blank"
            }
        ]);
    });

    test("rejects blank name", () => {
        const details = {
            template: "typescript",
            name: " "
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["name"],
                message: "name must not be blank",
                code: "blank"
            }
        ]);
    });

    test("rejects non string in links", () => {
        const details = {
            template: "typescript",
            name: "@laoban/example",
            links: ["@laoban/a", 42]
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["links", "1"],
                message: "links.1 must be a string but was a number",
                code: "wrong.type"
            }
        ]);
    });

    test("rejects blank string in devLinks", () => {
        const details = {
            template: "typescript",
            name: "@laoban/example",
            devLinks: ["ok", ""]
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["devLinks", "1"],
                message: "devLinks.1 must not be blank",
                code: "blank"
            }
        ]);
    });

    test("rejects non array peerLinks", () => {
        const details = {
            template: "typescript",
            name: "@laoban/example",
            peerLinks: "react"
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["peerLinks"],
                message: "peerLinks must be an array",
                code: "wrong.type"
            }
        ]);
    });

    test("rejects non boolean guard", () => {
        const details = {
            template: "typescript",
            name: "@laoban/example",
            guards: {
                compile: "yes"
            }
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["guards", "compile"],
                message: "guards.compile must be a boolean but was a string",
                code: "wrong.type"
            }
        ]);
    });

    test("rejects files when not an object", () => {
        const details = {
            template: "typescript",
            name: "@laoban/example",
            files: "package.json"
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["files"],
                message: "files must be an object",
                code: "wrong.type"
            }
        ]);
    });

    test("rejects meta when it is an array", () => {
        const details = {
            template: "typescript",
            name: "@laoban/example",
            meta: ["a", "b"]
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["meta"],
                message: "meta must be an object",
                code: "wrong.type"
            }
        ]);
    });

    test("reports multiple errors", () => {
        const details = {
            template: "",
            name: "",
            links: [1],
            guards: {compile: "yes"},
            files: 42,
            meta: false
        } as any;

        expect(issuesOf(validatePackageDetails([], makeObservabilityForTest())(details))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["template"],
                message: "template must not be blank",
                code: "blank"
            },
            {
                kind: "validation",
                severity: "error",
                context: ["name"],
                message: "name must not be blank",
                code: "blank"
            },
            {
                kind: "validation",
                severity: "error",
                context: ["links", "0"],
                message: "links.0 must be a string but was a number",
                code: "wrong.type"
            },
            {
                kind: "validation",
                severity: "error",
                context: ["guards", "compile"],
                message: "guards.compile must be a boolean but was a string",
                code: "wrong.type"
            },
            {
                kind: "validation",
                severity: "error",
                context: ["files"],
                message: "files must be an object",
                code: "wrong.type"
            },
            {
                kind: "validation",
                severity: "error",
                context: ["meta"],
                message: "meta must be an object",
                code: "wrong.type"
            }
        ]);
    });
});