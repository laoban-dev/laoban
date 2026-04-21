import {
    chainValidators,
    combineValidators,
    composeOr,
    composeTypedOr,
    deprecatedField,
    exactLength,
    format,
    ifPresent,
    integer,
    max,
    maxItems,
    maxLength,
    min,
    minItems,
    minLength,
    mustBeArrayOf,
    mustBeArrayOfIfPresent,
    mustBeBoolean,
    mustBeBooleanIfPresent,
    mustBeEnum,
    mustBeLiteral,
    mustBeNameAnd,
    mustBeNameAndIfPresent,
    mustBeNumber,
    mustBeNumberIfPresent,
    mustBeObjectWithFields, mustBeOneOf,
    mustBeString,
    mustBeStringIfPresent,
    nonBlank,
    nullableValidator,
    oneValidationError,
    pattern,
    renderContext,
    validationError,
    validationErrors,
    ValidationIssue,
    validationWarning,
    Validator,
    when,
} from "./validation";
import {nullObservability, Observability} from "@laoban/observability";
import {ErrorsOr, isErrors, value} from "@laoban/errors";

type TestDebugContext = "validation" | "validation:shape" | "validation:field" | "validation:union";

function makeObservability(): Observability {
    return {
        correlationId: "test-correlation-id",
        logger: jest.fn(),
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
        debugLevels: {},
        timeService: {now: () => 0},
    };
}

function issuesOf<T>(result: ErrorsOr<T, ValidationIssue>): ValidationIssue[] {
    return isErrors(result) ? result.errors : [];
}

function warningsOf<T>(result: ErrorsOr<T, ValidationIssue>): ValidationIssue[] {
    return result.warnings ?? [];
}

describe("helper functions", () => {
    test("renderContext renders root", () => {
        expect(renderContext([])).toBe("<root>");
    });

    test("renderContext joins path with dots", () => {
        expect(renderContext(["config", "scripts", "build"])).toBe("config.scripts.build");
    });

    test("validationError builds a structured error issue", () => {
        expect(
            validationError(["a", "b"], "bad", {code: "x"})
        ).toEqual({
            kind: "validation",
            severity: "error",
            context: ["a", "b"],
            message: "bad",
            code: "x",
        });
    });

    test("validationWarning builds a structured warning issue", () => {
        expect(
            validationWarning(["a"], "warn", {code: "w"})
        ).toEqual({
            kind: "validation",
            severity: "warning",
            context: ["a"],
            message: "warn",
            code: "w",
        });
    });

    test("oneValidationError creates one structured error", () => {
        const result = oneValidationError(["x"], "broken", {code: "boom"});
        expect(isErrors(result)).toBe(true);
        if (isErrors(result)) {
            expect(result.errors).toEqual([
                {
                    kind: "validation",
                    severity: "error",
                    context: ["x"],
                    message: "broken",
                    code: "boom",
                },
            ]);
        }
    });

    test("validationErrors creates several structured errors", () => {
        const e1 = validationError(["x"], "one", {code: "c1"});
        const e2 = validationError(["y"], "two", {code: "c2"});
        const w1 = validationWarning(["z"], "warn", {code: "w1"});

        const result = validationErrors(e1, [e2], [w1]);
        expect(result).toEqual({
            errors: [e1, e2],
            warnings: [w1],
        });
    });
});

describe("combineValidators", () => {
    const atLeast3: Validator<string> = ctx => value =>
        value.length >= 3
            ? {value}
            : oneValidationError(ctx, `${renderContext(ctx)} must be at least 3 chars`, {code: "min.length"});

    const combined = combineValidators(mustBeString, atLeast3);

    test("returns value for valid string", () => {
        const result = combined(["ctx"], makeObservability())("abcd");
        expect(result).toEqual({value: "abcd"});
    });

    test("collects errors from both validators when wrong type", () => {
        const result = combined(["ctx"], makeObservability())(123 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be a string but was a number",
                code: "wrong.type",
            },
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be at least 3 chars",
                code: "min.length",
            },
        ]);
    });

    test("returns length error for short string", () => {
        const result = combined(["ctx"], makeObservability())("ab");
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be at least 3 chars",
                code: "min.length",
            },
        ]);
    });
});

describe("composeOr", () => {
    const either = composeOr({
        string: mustBeString,
        stringArray: mustBeArrayOf(mustBeString),
    });

    test("passes if first validator succeeds", () => {
        const result = either(["x"], makeObservability())("foo");
        expect(result).toEqual({value: "foo"});
    });

    test("passes if second validator succeeds", () => {
        const input = ["bar"];
        const result = either(["x"], makeObservability())(input as any);
        expect(result).toEqual({value: input});
    });

    test("returns reasons if none succeed", () => {
        const result = either(["x"], makeObservability())(123 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x is not a string",
                code: "not.type",
            },
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x must be a string but was a number",
                code: "wrong.type",
            },
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x is not a stringArray",
                code: "not.type",
            },
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x must be an array",
                code: "wrong.type",
            },
        ]);
    });
});

describe("chainValidators", () => {
    const failOne: Validator<string> =
        (context) => (_input) =>
            oneValidationError(
                context,
                `${renderContext(context)} failed first`,
                {code: "failed.first"}
            );

    const failTwo: Validator<string> =
        (context) => (_input) =>
            oneValidationError(
                context,
                `${renderContext(context)} failed second`,
                {code: "failed.second"}
            );

    const pass: Validator<string> =
        (_context) => (input) =>
            value(input);

    const warn: Validator<string> =
        (context) => (input) =>
            value(input, [
                {
                    kind: "validation",
                    severity: "warning",
                    context,
                    message: `${renderContext(context)} warning`,
                    code: "warning",
                },
            ]);

    test("returns value when all validators pass", () => {
        const validator = chainValidators(pass, pass);

        expect(validator(["x"], makeObservability())("hello")).toEqual({
            value: "hello",
        });
    });

    test("stops at the first failure", () => {
        const validator = chainValidators(pass, failOne, failTwo);

        const result = validator(["x"], makeObservability())("hello");

        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x failed first",
                code: "failed.first",
            },
        ]);
    });

    test("does not run later validators after a failure", () => {
        const later = jest.fn<ReturnType<Validator<string>>, Parameters<Validator<string>>>(
            (_context) => (_input) => value("later")
        );

        const validator = chainValidators(pass, failOne, later as unknown as Validator<string>);
        validator(["x"], makeObservability())("hello");

        expect(later).not.toHaveBeenCalled();
    });

    test("preserves warnings from earlier successful validators when a later validator fails", () => {
        const validator = chainValidators(warn, failOne);

        const result = validator(["x"], makeObservability())("hello");

        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x failed first",
                code: "failed.first",
            },
        ]);
        expect(warningsOf(result)).toEqual([
            {
                kind: "validation",
                severity: "warning",
                context: ["x"],
                message: "x warning",
                code: "warning",
            },
        ]);
    });

    test("preserves warnings when all validators pass", () => {
        const validator = chainValidators(warn, pass);

        const result = validator(["x"], makeObservability())("hello");

        expect(result).toEqual({
            value: "hello",
            warnings: [
                {
                    kind: "validation",
                    severity: "warning",
                    context: ["x"],
                    message: "x warning",
                    code: "warning",
                },
            ],
        });
    });
});

describe("mustBeType (required)", () => {
    test("flags undefined", () => {
        const result = mustBeString(["ctx"], makeObservability())(undefined as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx is required but was undefined",
                code: "required",
            },
        ]);
    });

    test("flags null", () => {
        const result = mustBeString(["ctx"], makeObservability())(null as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx is required but was null",
                code: "required",
            },
        ]);
    });

    test("returns value for correct type", () => {
        expect(mustBeNumber(["n"], makeObservability())(42)).toEqual({value: 42});
    });

    test("returns error for wrong type", () => {
        const result = mustBeBoolean(["b"], makeObservability())("true" as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["b"],
                message: "b must be a boolean but was a string",
                code: "wrong.type",
            },
        ]);
    });
});

describe("mustBeTypeIfPresent (optional)", () => {
    test("skips undefined", () => {
        expect(mustBeStringIfPresent(["s"], makeObservability())(undefined)).toEqual({value: undefined});
    });

    test("skips null", () => {
        expect(mustBeNumberIfPresent(["n"], makeObservability())(null as any)).toEqual({value: null});
    });

    test("returns value for correct type", () => {
        expect(mustBeBooleanIfPresent(["b"], makeObservability())(false)).toEqual({value: false});
    });

    test("returns error for wrong type", () => {
        const result = mustBeStringIfPresent(["s"], makeObservability())(123 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["s"],
                message: "s must be a string but was a number",
                code: "wrong.type",
            },
        ]);
    });
});

describe("Array validators", () => {
    const numArr = mustBeArrayOf(mustBeNumber);
    const numArrOpt = mustBeArrayOfIfPresent(mustBeNumber);

    test("mustBeArrayOf: valid array", () => {
        expect(numArr(["arr"], makeObservability())([1, 2, 3])).toEqual({value: [1, 2, 3]});
    });

    test("mustBeArrayOf: element error", () => {
        const result = numArr(["arr"], makeObservability())([1, "x" as any, 3]);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["arr", "1"],
                message: "arr.1 must be a number but was a string",
                code: "wrong.type",
            },
        ]);
    });

    test("mustBeArrayOf: non-array value", () => {
        const result = numArr(["arr"], makeObservability())(5 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["arr"],
                message: "arr must be an array",
                code: "wrong.type",
            },
        ]);
    });

    test("mustBeArrayOfIfPresent: skips undefined", () => {
        expect(numArrOpt(["arr"], makeObservability())(undefined)).toEqual({value: undefined});
    });

    test("mustBeArrayOfIfPresent: skips null", () => {
        expect(numArrOpt(["arr"], makeObservability())(null as any)).toEqual({value: null});
    });

    test("mustBeArrayOfIfPresent: element error", () => {
        const result = numArrOpt(["arr"], makeObservability())([1, "x" as any]);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["arr", "1"],
                message: "arr.1 must be a number but was a string",
                code: "wrong.type",
            },
        ]);
    });

    test("mustBeArrayOfIfPresent: non-array value", () => {
        const result = numArrOpt(["arr"], makeObservability())(5 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["arr"],
                message: "arr must be an array",
                code: "wrong.type",
            },
        ]);
    });
});

describe("mustBeObjectWithFields", () => {
    interface Dummy {
        a: string;
        b?: number;
    }

    const validateDummy = mustBeObjectWithFields<Dummy>({
        a: mustBeString,
        b: mustBeNumberIfPresent,
    });

    test("valid object", () => {
        expect(validateDummy(["d"], makeObservability())({a: "hi", b: 10})).toEqual({
            value: {a: "hi", b: 10},
        });
    });

    test("missing required field returns error", () => {
        const result = validateDummy(["d"], makeObservability())({b: 5} as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["d", "a"],
                message: "d.a is required but was undefined",
                code: "required",
            },
        ]);
    });

    test("invalid optional field", () => {
        const result = validateDummy(["d"], makeObservability())({a: "ok", b: "no" as any});
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["d", "b"],
                message: "d.b must be a number but was a string",
                code: "wrong.type",
            },
        ]);
    });

    test("non-object value", () => {
        const result = validateDummy(["d"], makeObservability())(123 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["d"],
                message: "d must be an object",
                code: "wrong.type",
            },
        ]);
    });
});

describe("mustBeNameAnd", () => {
    const validate = mustBeNameAnd(mustBeString);
    const reqValidate = mustBeNameAnd(mustBeString, true);

    test("valid NameAnd", () => {
        expect(validate(["context"], makeObservability())({key1: "value1", key2: "value2"})).toEqual({
            value: {key1: "value1", key2: "value2"},
        });
    });

    test("value wrong type", () => {
        const result = validate(["context"], makeObservability())({key1: "value1", key2: 42 as any});
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["context", "key2"],
                message: "context.key2 must be a string but was a number",
                code: "wrong.type",
            },
        ]);
    });

    test("missing value", () => {
        expect(issuesOf(reqValidate(["context"], makeObservability())(null as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["context"],
                message: "context must be an object",
                code: "wrong.type",
            },
        ]);

        expect(validate(["context"], makeObservability())(null as any)).toEqual({value: null});

        expect(issuesOf(reqValidate(["context"], makeObservability())(undefined as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["context"],
                message: "context must be an object",
                code: "wrong.type",
            },
        ]);

        expect(validate(["context"], makeObservability())(undefined as any)).toEqual({value: undefined});
    });

    test("non-object value", () => {
        const result = validate(["context"], makeObservability())("not an object" as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["context"],
                message: "context must be an object",
                code: "wrong.type",
            },
        ]);
    });

    test("rejects array explicitly", () => {
        const v = mustBeNameAnd(mustBeString, true);
        const result = v(["ctx"], makeObservability())([] as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be a NameAnd object, not an array",
                code: "wrong.type",
            },
        ]);
    });

    test("invalid key: empty string / whitespace key", () => {
        const v = mustBeNameAnd(mustBeString, true);
        const obj = {"": "x", "   ": "y", ok: "z"} as any;

        const result = v(["ctx"], makeObservability())(obj);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx has invalid key: ",
                code: "invalid.key",
            },
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx has invalid key:    ",
                code: "invalid.key",
            },
        ]);
    });

    test("multiple value errors are accumulated", () => {
        const v = mustBeNameAnd(mustBeNumber, true);
        const result = v(["ctx"], makeObservability())({a: 1, b: "no" as any, c: null as any});

        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx", "b"],
                message: "ctx.b must be a number but was a string",
                code: "wrong.type",
            },
            {
                kind: "validation",
                severity: "error",
                context: ["ctx", "c"],
                message: "ctx.c is required but was null",
                code: "required",
            },
        ]);
    });
});
describe("mustBeNameAndIfPresent", () => {
    const observability = nullObservability();

    it("accepts undefined", () => {
        const validator = mustBeNameAndIfPresent(mustBeString);

        const result = validator([], observability)(undefined);

        expect(isErrors(result)).toBe(false);
        if (!isErrors(result)) {
            expect(result.value).toBeUndefined();
        }
    });

    it("accepts a record of valid values", () => {
        const validator = mustBeNameAndIfPresent(mustBeString);

        const input = {
            one: "a",
            two: "b",
        };

        const result = validator([], observability)(input);

        expect(isErrors(result)).toBe(false);
        if (!isErrors(result)) {
            expect(result.value).toEqual(input);
        }
    });

    it("fails when any value is invalid", () => {
        const validator = mustBeNameAndIfPresent(mustBeString);

        const input: unknown = {
            one: "a",
            two: 2,
        };

        const result = validator([], observability)(input as any); //deliberately bypassing type system to test runtime validation

        expect(isErrors(result)).toBe(true);
    });
});
describe("mustBeOneOf", () => {
    test("ok + wrong value", () => {
        const v = mustBeOneOf("yes" as const, "no" as const);
        expect(v(["ctx"], makeObservability())("yes")).toEqual({value: "yes"});
        expect(v(["ctx"], makeObservability())("no")).toEqual({value: "no"});

        const result = v(["ctx"], makeObservability())("maybe" as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: 'ctx must be one of "yes", "no" but was "maybe"',
                code: "wrong.literal",
            },
        ]);
    });

    test("wrong runtime type", () => {
        const v = mustBeOneOf("x" as const, "y" as const);
        const result = v(["ctx"], makeObservability())(123 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be a string",
                code: "wrong.type",
            },
        ]);
    });

    test("rejects undefined", () => {
        const v = mustBeOneOf("x" as const, "y" as const);
        expect(issuesOf(v(["ctx"], makeObservability())(undefined as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx is required but was undefined",
                code: "required",
            },
        ]);
    });

    test("rejects null", () => {
        const v = mustBeOneOf("x" as const, "y" as const);
        expect(issuesOf(v(["ctx"], makeObservability())(null as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx is required but was null",
                code: "required",
            },
        ]);
    });
});
describe("mustBeLiteral", () => {
    test("string literal: ok + wrong value", () => {
        const v = mustBeLiteral("yes" as const);
        expect(v(["ctx"], makeObservability())("yes")).toEqual({value: "yes"});

        const result = v(["ctx"], makeObservability())("no" as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: 'ctx must be "yes" but was "no"',
                code: "wrong.literal",
            },
        ]);
    });

    test("string literal: wrong runtime type", () => {
        const v = mustBeLiteral("x" as const);
        const result = v(["ctx"], makeObservability())(123 as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be a string",
                code: "wrong.type",
            },
        ]);
    });

    test("null literal: accepts null, rejects undefined and non-null", () => {
        const v = mustBeLiteral(null);
        expect(v(["ctx"], makeObservability())(null)).toEqual({value: null});

        expect(issuesOf(v(["ctx"], makeObservability())(undefined as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx is required but was undefined",
                code: "required",
            },
        ]);

        expect(issuesOf(v(["ctx"], makeObservability())("nope" as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: 'ctx must be null but was "nope"',
                code: "wrong.literal",
            },
        ]);
    });

    test("non-null literal: rejects null", () => {
        const v = mustBeLiteral(5 as const);
        expect(issuesOf(v(["ctx"], makeObservability())(null as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be 5 but was null",
                code: "wrong.literal",
            },
        ]);
    });

    test("NaN literal: Object.is semantics", () => {
        const v = mustBeLiteral(Number.NaN);
        expect(v(["ctx"], makeObservability())(Number.NaN)).toEqual({value: Number.NaN});
    });

    test("-0 vs 0: Object.is semantics", () => {
        const vNegZero = mustBeLiteral(-0 as const);
        expect(vNegZero(["ctx"], makeObservability())(-0)).toEqual({value: -0});

        const negZeroFail = vNegZero(["ctx"], makeObservability())(0 as any);
        expect(issuesOf(negZeroFail)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be 0 but was 0",
                code: "wrong.literal",
            },
        ]);

        const vZero = mustBeLiteral(0 as const);
        expect(vZero(["ctx"], makeObservability())(0)).toEqual({value: 0});

        const zeroFail = vZero(["ctx"], makeObservability())(-0 as any);
        expect(issuesOf(zeroFail)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be 0 but was 0",
                code: "wrong.literal",
            },
        ]);
    });
});

describe("composeTypedOr", () => {
    type Cat = { type: "cat"; meows: boolean };
    type Dog = { type: "dog"; barks: boolean };
    type Pet = Cat | Dog;

    const catV: Validator<Cat> = (ctx, obs) => (v) => {
        if (!v || typeof v !== "object") return oneValidationError(ctx, `${renderContext(ctx)} must be an object`, {code: "wrong.type"});
        if ((v as any).type !== "cat") return oneValidationError([...ctx, "type"], `${renderContext([...ctx, "type"])} must be "cat"`, {code: "wrong.literal"});
        if (typeof (v as any).meows !== "boolean") return oneValidationError([...ctx, "meows"], `${renderContext([...ctx, "meows"])} must be a boolean`, {code: "wrong.type"});
        return value(v);
    };

    const dogV: Validator<Dog> = (ctx, obs) => (v) => {
        if (!v || typeof v !== "object") return oneValidationError(ctx, `${renderContext(ctx)} must be an object`, {code: "wrong.type"});
        if ((v as any).type !== "dog") return oneValidationError([...ctx, "type"], `${renderContext([...ctx, "type"])} must be "dog"`, {code: "wrong.literal"});
        if (typeof (v as any).barks !== "boolean") return oneValidationError([...ctx, "barks"], `${renderContext([...ctx, "barks"])} must be a boolean`, {code: "wrong.type"});
        return value(v);
    };

    const typed = composeTypedOr<{
        cat: Validator<Cat>;
        dog: Validator<Dog>;
    }, Pet>(
        p => (p as any).type,
        {cat: catV, dog: dogV}
    );

    test("dispatches to the right validator and succeeds", () => {
        expect(typed(["pet"], makeObservability())({type: "cat", meows: true})).toEqual({
            value: {type: "cat", meows: true},
        });
        expect(typed(["pet"], makeObservability())({type: "dog", barks: false})).toEqual({
            value: {type: "dog", barks: false},
        });
    });

    test("typeFn throws -> has no valid type", () => {
        const throwing = composeTypedOr<any, any>(
            () => {
                throw new Error("boom");
            },
            {cat: catV, dog: dogV} as any
        );

        const result = throwing(["pet"], makeObservability())({type: "cat", meows: true});
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["pet"],
                message: "pet has no valid type",
                code: "missing.type",
            },
        ]);
    });

    test("illegal type -> lists legal values sorted", () => {
        const v = composeTypedOr<any, any>(
            p => (p as any).type,
            {dog: dogV, cat: catV}
        );

        const result = v(["pet"], makeObservability())({type: "hamster"} as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["pet"],
                message: "pet has illegal type hamster. Legal values are: cat, dog",
                code: "illegal.type",
            },
        ]);
    });

    test("returns underlying validator errors for that type", () => {
        const result = typed(["pet"], makeObservability())({type: "cat", meows: "yes"} as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["pet", "meows"],
                message: "pet.meows must be a boolean",
                code: "wrong.type",
            },
        ]);
    });
});

describe("mustBeObjectWithFields extra branches", () => {
    interface Dummy {
        a: string;
        b?: number;
    }

    const opt = mustBeObjectWithFields<Dummy>(
        {a: mustBeString, b: mustBeNumberIfPresent},
        false
    );

    const req = mustBeObjectWithFields<Dummy>(
        {a: mustBeString, b: mustBeNumberIfPresent},
        true
    );

    test("optional object validator: skips undefined/null", () => {
        expect(opt(["d"], makeObservability())(undefined as any)).toEqual({value: undefined});
        expect(opt(["d"], makeObservability())(null as any)).toEqual({value: null});
    });

    test("required object validator: rejects undefined/null with must be an object", () => {
        expect(issuesOf(req(["d"], makeObservability())(undefined as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["d"],
                message: "d must be an object",
                code: "wrong.type",
            },
        ]);

        expect(issuesOf(req(["d"], makeObservability())(null as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["d"],
                message: "d must be an object",
                code: "wrong.type",
            },
        ]);
    });

    test("rejects arrays explicitly", () => {
        expect(issuesOf(opt(["d"], makeObservability())([] as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["d"],
                message: "d must be an object",
                code: "wrong.type",
            },
        ]);

        expect(issuesOf(req(["d"], makeObservability())([] as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["d"],
                message: "d must be an object",
                code: "wrong.type",
            },
        ]);
    });
});

describe("combineValidators debug pass-through", () => {
    test("debug emits through observability", () => {
        const obs = makeObservability();
        const atLeast3: Validator<string> = ctx => value =>
            value.length >= 3
                ? {value}
                : oneValidationError(ctx, `${renderContext(ctx)} must be at least 3 chars`, {code: "min.length"});

        const combined = combineValidators(mustBeString, atLeast3);
        combined(["ctx"], obs)("ab");

        expect(obs.debug).toHaveBeenCalled();
    });
});

describe("constraint combinators", () => {
    test("minLength: passes when length >= n", () => {
        const v = minLength(3)(["s"], makeObservability());
        expect(v("abc")).toEqual({value: "abc"});
        expect(v("abcd")).toEqual({value: "abcd"});
    });

    test("minLength: fails when length < n", () => {
        const v = minLength(3)(["s"], makeObservability());
        expect(issuesOf(v("ab"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["s"],
                message: "s must have length >= 3",
                code: "min.length",
            },
        ]);
    });

    test("maxLength: passes when length <= n", () => {
        const v = maxLength(3)(["s"], makeObservability());
        expect(v("")).toEqual({value: ""});
        expect(v("abc")).toEqual({value: "abc"});
    });

    test("maxLength: fails when length > n", () => {
        const v = maxLength(3)(["s"], makeObservability());
        expect(issuesOf(v("abcd"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["s"],
                message: "s must have length <= 3",
                code: "max.length",
            },
        ]);
    });

    test("pattern: passes when regex matches", () => {
        const v = pattern(/^[a-z]+$/)(["s"], makeObservability());
        expect(v("abc")).toEqual({value: "abc"});
    });

    test("pattern: fails when regex does not match", () => {
        const v = pattern(/^[a-z]+$/)(["s"], makeObservability());
        expect(issuesOf(v("abc123"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["s"],
                message: "s must match pattern /^[a-z]+$/",
                code: "pattern",
            },
        ]);
    });

    test("pattern: uses provided name in error message", () => {
        const v = pattern(/^[a-z]+$/, "letters")(["s"], makeObservability());
        expect(issuesOf(v("abc123"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["s"],
                message: "s must match pattern letters",
                code: "pattern",
            },
        ]);
    });

    test("format('uuid'): accepts valid UUIDs", () => {
        const v = format("uuid")(["id"], makeObservability());
        expect(v("550e8400-e29b-41d4-a716-446655440000")).toEqual({
            value: "550e8400-e29b-41d4-a716-446655440000",
        });
    });

    test("format('uuid'): rejects invalid UUIDs", () => {
        const v = format("uuid")(["id"], makeObservability());
        expect(issuesOf(v("not-a-uuid"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["id"],
                message: "id must match pattern uuid",
                code: "pattern",
            },
        ]);
    });

    test("format(unknown): no-op", () => {
        const v = format("somethingElse")(["x"], makeObservability());
        expect(v("anything")).toEqual({value: "anything"});
    });

    test("min: passes when value >= n", () => {
        const v = min(10)(["n"], makeObservability());
        expect(v(10)).toEqual({value: 10});
        expect(v(11)).toEqual({value: 11});
    });

    test("min: fails when value < n", () => {
        const v = min(10)(["n"], makeObservability());
        expect(issuesOf(v(9))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["n"],
                message: "n must be >= 10",
                code: "min",
            },
        ]);
    });

    test("max: passes when value <= n", () => {
        const v = max(10)(["n"], makeObservability());
        expect(v(10)).toEqual({value: 10});
        expect(v(9)).toEqual({value: 9});
    });

    test("max: fails when value > n", () => {
        const v = max(10)(["n"], makeObservability());
        expect(issuesOf(v(11))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["n"],
                message: "n must be <= 10",
                code: "max",
            },
        ]);
    });

    test("integer: passes for integers", () => {
        const v = integer()(["n"], makeObservability());
        expect(v(0)).toEqual({value: 0});
        expect(v(10)).toEqual({value: 10});
        expect(v(-3)).toEqual({value: -3});
    });

    test("integer: fails for non-integers", () => {
        const v = integer()(["n"], makeObservability());
        expect(issuesOf(v(1.5))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["n"],
                message: "n must be an integer",
                code: "integer",
            },
        ]);
    });

    test("minItems: passes when length >= n", () => {
        const v = minItems(2)(["arr"], makeObservability());
        expect(v([1, 2])).toEqual({value: [1, 2]});
        expect(v([1, 2, 3])).toEqual({value: [1, 2, 3]});
    });

    test("minItems: fails when length < n", () => {
        const v = minItems(2)(["arr"], makeObservability());
        expect(issuesOf(v([1]))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["arr"],
                message: "arr must have at least 2 items",
                code: "min.items",
            },
        ]);
    });

    test("maxItems: passes when length <= n", () => {
        const v = maxItems(2)(["arr"], makeObservability());
        expect(v([])).toEqual({value: []});
        expect(v([1, 2])).toEqual({value: [1, 2]});
    });

    test("maxItems: fails when length > n", () => {
        const v = maxItems(2)(["arr"], makeObservability());
        expect(issuesOf(v([1, 2, 3]))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["arr"],
                message: "arr must have at most 2 items",
                code: "max.items",
            },
        ]);
    });

    test("passes when length is exactly n", () => {
        const v = exactLength(3)(["s"], makeObservability());
        expect(v("abc")).toEqual({value: "abc"});
    });

    test("fails when length is less than n", () => {
        const v = exactLength(3)(["s"], makeObservability());
        expect(issuesOf(v("ab"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["s"],
                message: "s must have length = 3",
                code: "exact.length",
            },
        ]);
    });

    test("fails when length is greater than n", () => {
        const v = exactLength(3)(["s"], makeObservability());
        expect(issuesOf(v("abcd"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["s"],
                message: "s must have length = 3",
                code: "exact.length",
            },
        ]);
    });

    test("passes for empty string when n is zero", () => {
        const v = exactLength(0)(["s"], makeObservability());
        expect(v("")).toEqual({value: ""});
    });

});

describe("when combinator", () => {
    const failing: Validator<string> =
        ctx => _value => oneValidationError(ctx, `${renderContext(ctx)} failed`, {code: "failed"});

    const passing: Validator<string> =
        _ctx => value => ({value});

    test("when(true, v): runs validator", () => {
        const v = when(true, failing);
        const result = v(["x"], makeObservability())("anything");
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x failed",
                code: "failed",
            },
        ]);
    });

    test("when(false, v): skips validator", () => {
        const v = when(false, failing);
        expect(v(["x"], makeObservability())("anything")).toEqual({value: "anything"});
    });

    test("when(true, passing): still passes", () => {
        const v = when(true, passing);
        expect(v(["x"], makeObservability())("anything")).toEqual({value: "anything"});
    });

    test("when composes correctly inside combineValidators", () => {
        const v = combineValidators(
            passing,
            when(false, failing),
            when(true, failing)
        );

        const result = v(["x"], makeObservability())("value");
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x failed",
                code: "failed",
            },
        ]);
    });
});

describe("mustBeEnum", () => {
    test("returns no errors for an allowed value", () => {
        const validator = mustBeEnum(["red", "green", "blue"] as const);
        expect(validator(["colour"], makeObservability())("green")).toEqual({value: "green"});
    });

    test("returns an error when value is undefined", () => {
        const validator = mustBeEnum(["red", "green", "blue"] as const);
        expect(issuesOf(validator(["colour"], makeObservability())(undefined as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["colour"],
                message: "colour is required but was undefined",
                code: "required",
            },
        ]);
    });

    test("returns an error when value is null", () => {
        const validator = mustBeEnum(["red", "green", "blue"] as const);
        expect(issuesOf(validator(["colour"], makeObservability())(null as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["colour"],
                message: "colour is required but was null",
                code: "required",
            },
        ]);
    });

    test("returns an error when value is not a string", () => {
        const validator = mustBeEnum(["red", "green", "blue"] as const);
        expect(issuesOf(validator(["colour"], makeObservability())(42 as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["colour"],
                message: "colour must be a string",
                code: "wrong.type",
            },
        ]);
    });

    test("returns an error when value is not in the enum", () => {
        const validator = mustBeEnum(["red", "green", "blue"] as const);
        expect(issuesOf(validator(["colour"], makeObservability())("yellow" as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["colour"],
                message: 'colour must be one of "red", "green", "blue" but was "yellow"',
                code: "enum",
            },
        ]);
    });

    test("uses the supplied context in the error", () => {
        const validator = mustBeEnum(["small", "medium", "large"] as const);
        expect(issuesOf(validator(["product", "size"], makeObservability())("huge" as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["product", "size"],
                message: 'product.size must be one of "small", "medium", "large" but was "huge"',
                code: "enum",
            },
        ]);
    });

    test("supports a single legal value", () => {
        const validator = mustBeEnum(["admin"] as const);

        expect(validator(["role"], makeObservability())("admin")).toEqual({value: "admin"});
        expect(issuesOf(validator(["role"], makeObservability())("user" as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["role"],
                message: 'role must be one of "admin" but was "user"',
                code: "enum",
            },
        ]);
    });
});

describe("nullableValidator", () => {
    test("passes null without calling inner validator", () => {
        const inner = jest.fn<
            ReturnType<Validator<string>>,
            Parameters<Validator<string>>
        >((_ctx, _observability) => (_value) => oneValidationError(["bad"], "should not be called"));

        const v = nullableValidator(inner);
        expect(v(["ctx"], makeObservability())(null)).toEqual({value: null});
        expect(inner).not.toHaveBeenCalled();
    });

    test("delegates to inner validator for non-null values", () => {
        const v = nullableValidator(mustBeString);

        expect(v(["ctx"], makeObservability())("hello")).toEqual({value: "hello"});
        expect(issuesOf(v(["ctx"], makeObservability())(123 as any))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["ctx"],
                message: "ctx must be a string but was a number",
                code: "wrong.type",
            },
        ]);
    });

    test("forwards context to inner validator", () => {
        const inner: Validator<string> = ctx => _value =>
            oneValidationError(ctx, `${renderContext(ctx)} failed`, {code: "failed"});

        const v = nullableValidator(inner);
        const result = v(["some", "path"], makeObservability())("x");

        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["some", "path"],
                message: "some.path failed",
                code: "failed",
            },
        ]);
    });

    test("works with object validators", () => {
        const v = nullableValidator(
            mustBeObjectWithFields({
                id: mustBeString,
                value: mustBeString,
            }, true)
        );

        expect(v(["cas"], makeObservability())(null)).toEqual({value: null});
        expect(v(["cas"], makeObservability())({id: "1", value: "x"})).toEqual({
            value: {id: "1", value: "x"},
        });
        expect(issuesOf(v(["cas"], makeObservability())({id: "1", value: 2 as any}))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["cas", "value"],
                message: "cas.value must be a string but was a number",
                code: "wrong.type",
            },
        ]);
    });
});

describe("warnings", () => {
    test("deprecatedField returns a value with warning", () => {
        const result = deprecatedField("deprecated field")(
            ["config", "oldField"],
            makeObservability()
        )("x");

        expect(result).toEqual({
            value: "x",
            warnings: [
                {
                    kind: "validation",
                    severity: "warning",
                    context: ["config", "oldField"],
                    message: "deprecated field",
                    code: "deprecated",
                },
            ],
        });
    });

    test("combineValidators preserves warnings from successful validators", () => {
        const combined = combineValidators(
            deprecatedField("deprecated field") as Validator<string>,
            mustBeString
        );

        const result = combined(["config", "field"], makeObservability())("value");
        expect(result).toEqual({
            value: "value",
            warnings: [
                {
                    kind: "validation",
                    severity: "warning",
                    context: ["config", "field"],
                    message: "deprecated field",
                    code: "deprecated",
                },
            ],
        });
    });

    test("warnings survive even when another validator fails", () => {
        const combined = combineValidators(
            deprecatedField("deprecated field") as Validator<string>,
            mustBeNumber as any
        );

        const result = combined(["config", "field"], makeObservability())("value" as any);
        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["config", "field"],
                message: "config.field must be a number but was a string",
                code: "wrong.type",
            },
        ]);
        expect(warningsOf(result)).toEqual([
            {
                kind: "validation",
                severity: "warning",
                context: ["config", "field"],
                message: "deprecated field",
                code: "deprecated",
            },
        ]);
    });
});
describe("nonBlank", () => {
    test("returns value when the string is not blank", () => {
        expect(nonBlank(["field"], makeObservability())("hello")).toEqual(value("hello"));
    });

    test("returns value when the string has surrounding whitespace but is not blank", () => {
        expect(nonBlank(["field"], makeObservability())("  hello  ")).toEqual(value("  hello  "));
    });

    test("returns an error when the string is empty", () => {
        expect(issuesOf(nonBlank(["field"], makeObservability())(""))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["field"],
                message: "field must not be blank",
                code: "blank",
            },
        ]);
    });

    test("returns an error when the string is only spaces", () => {
        expect(issuesOf(nonBlank(["field"], makeObservability())("   "))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["field"],
                message: "field must not be blank",
                code: "blank",
            },
        ]);
    });

    test("returns an error when the string is only tabs and newlines", () => {
        expect(issuesOf(nonBlank(["field"], makeObservability())("\t \n"))).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["field"],
                message: "field must not be blank",
                code: "blank",
            },
        ]);
    });
});

describe("ifPresent", () => {
    const fail: Validator<string> =
        (context) => (_input) =>
            oneValidationError(
                context,
                `${renderContext(context)} failed`,
                {code: "failed"}
            );

    const pass: Validator<string> =
        (_context) => (input) =>
            value(input);

    const warn: Validator<string> =
        (context) => (input) =>
            value(input, [
                {
                    kind: "validation",
                    severity: "warning",
                    context,
                    message: `${renderContext(context)} warning`,
                    code: "warning",
                },
            ]);

    test("passes through undefined without calling inner validator", () => {
        const inner = jest.fn<ReturnType<Validator<string>>, Parameters<Validator<string>>>(
            (_context) => (_input) => value("should not happen")
        );

        const validator = ifPresent(inner as unknown as Validator<string>);
        const result = validator(["x"], makeObservability())(undefined);

        expect(result).toEqual({ value: undefined });
        expect(inner).not.toHaveBeenCalled();
    });

    test("passes through null without calling inner validator", () => {
        const inner = jest.fn<ReturnType<Validator<string>>, Parameters<Validator<string>>>(
            (_context) => (_input) => value("should not happen")
        );

        const validator = ifPresent(inner as unknown as Validator<string>);
        const result = validator(["x"], makeObservability())(null as any);

        expect(result).toEqual({ value: null });
        expect(inner).not.toHaveBeenCalled();
    });

    test("delegates to inner validator when value is present", () => {
        const validator = ifPresent(pass);
        const result = validator(["x"], makeObservability())("hello");

        expect(result).toEqual({ value: "hello" });
    });

    test("returns inner validator errors when value is present and invalid", () => {
        const validator = ifPresent(fail);
        const result = validator(["x"], makeObservability())("hello");

        expect(issuesOf(result)).toEqual([
            {
                kind: "validation",
                severity: "error",
                context: ["x"],
                message: "x failed",
                code: "failed",
            },
        ]);
    });

    test("preserves warnings from inner validator", () => {
        const validator = ifPresent(warn);
        const result = validator(["x"], makeObservability())("hello");

        expect(result).toEqual({
            value: "hello",
            warnings: [
                {
                    kind: "validation",
                    severity: "warning",
                    context: ["x"],
                    message: "x warning",
                    code: "warning",
                },
            ],
        });
    });
});