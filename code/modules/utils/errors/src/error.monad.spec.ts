import {
    AsyncErrorCall,
    AsyncErrorCall2,
    BaseIssue,
    errorObjectOrThrow,
    errors,
    ErrorsException,
    errorsOrThrow,
    flatmapArrayOfArrayOfErrorsOr, flatMapBaseIssue,
    flatMapErrorsOr,
    flatMapErrorsOrK,
    flattenArrayOfErrorsOr,
    flattenRecordOfErrorsOr,
    isErrors,
    isValue,
    makeErrorFromException, mapBaseIssue,
    mapErrorsOr,
    mapErrorsOrK,
    partitionNameAndErrorsOr,
    recover,
    value,
    valueOrDefault,
    valueOrThrow,
    warnings,
} from "./error.monad";

type TestIssue = BaseIssue<string, unknown>;

const err = (message: string, context?: unknown): TestIssue => ({
    kind: "test",
    message,
    ...(context !== undefined ? {context} : {}),
});

describe("error.monad", () => {
    describe("constructors and guards", () => {
        it("value creates a value without warnings when not provided", () => {
            const result = value(42);
            expect(result).toEqual({value: 42});
            expect(isValue(result)).toBe(true);
            expect(isErrors(result)).toBe(false);
            expect(warnings(result)).toEqual([]);
        });

        it("value creates a value with warnings when provided", () => {
            const w1 = err("deprecated");
            const result = value(42, [w1]);
            expect(result).toEqual({value: 42, warnings: [w1]});
            expect(isValue(result)).toBe(true);
            expect(warnings(result)).toEqual([w1]);
        });

        it("value omits warnings when given empty warning array", () => {
            const result = value(42, []);
            expect(result).toEqual({value: 42});
            expect(warnings(result)).toEqual([]);
        });

        it("errors creates an errors object without warnings when not provided", () => {
            const e1 = err("bad");
            const result = errors(e1);
            expect(result).toEqual({errors: [e1]});
            expect(isErrors(result)).toBe(true);
            expect(isValue(result)).toBe(false);
            expect(warnings(result)).toEqual([]);
        });

        it("errors creates an errors object with rest warnings and reference", () => {
            const e1 = err("bad1");
            const e2 = err("bad2");
            const w1 = err("warn1");
            const result = errors(e1, [e2], [w1], "ref-1");
            expect(result).toEqual({
                errors: [e1, e2],
                warnings: [w1],
                reference: "ref-1",
            });
            expect(isErrors(result)).toBe(true);
            expect(warnings(result)).toEqual([w1]);
        });

        it("errors omits warnings when given empty warning array", () => {
            const e1 = err("bad");
            const result = errors(e1, [], []);
            expect(result).toEqual({errors: [e1]});
            expect(warnings(result)).toEqual([]);
        });
    });

    describe("warnings", () => {
        it("returns empty array for value without warnings", () => {
            expect(warnings(value("x"))).toEqual([]);
        });

        it("returns warnings from value", () => {
            const w1 = err("warn");
            expect(warnings(value("x", [w1]))).toEqual([w1]);
        });

        it("returns warnings from errors", () => {
            const e1 = err("bad");
            const w1 = err("warn");
            expect(warnings(errors(e1, undefined, [w1]))).toEqual([w1]);
        });

        it("returns empty array from errors without warnings", () => {
            const e1 = err("bad");
            expect(warnings(errors(e1))).toEqual([]);
        });
    });

    describe("valueOrThrow", () => {
        it("returns the value when value branch", () => {
            expect(valueOrThrow(value(123))).toBe(123);
        });

        it("throws ErrorsException when errors branch", () => {
            const e1 = err("bad");
            const w1 = err("warn");
            expect(() => valueOrThrow(errors(e1, undefined, [w1], "ref-x"))).toThrow(ErrorsException);

            try {
                valueOrThrow(errors(e1, undefined, [w1], "ref-x"));
                fail("Expected exception");
            } catch (e) {
                expect(e).toBeInstanceOf(ErrorsException);
                const ex = e as ErrorsException<TestIssue>;
                expect(ex.errors).toEqual([e1]);
                expect(ex.warnings).toEqual([w1]);
                expect(ex.reference).toBe("ref-x");
            }
        });
    });

    describe("valueOrDefault", () => {
        it("returns the wrapped value when present", () => {
            expect(valueOrDefault(value(5), 9)).toBe(5);
        });

        it("returns default when errors are present", () => {
            expect(valueOrDefault(errors(err("bad")), 9)).toBe(9);
        });

        it("returns default when value is null", () => {
            expect(valueOrDefault(value<number | null>(null), 9)).toBe(9);
        });

        it("returns default when value is undefined", () => {
            expect(valueOrDefault(value<number | undefined>(undefined), 9)).toBe(9);
        });
    });

    describe("errorsOrThrow", () => {
        it("returns errors when error branch", () => {
            const e1 = err("bad");
            expect(errorsOrThrow(errors(e1))).toEqual([e1]);
        });

        it("throws structured exception when value branch", () => {
            const w1 = err("warn");
            try {
                errorsOrThrow(value(123, [w1]));
                fail("Expected exception");
            } catch (e) {
                expect(e).toBeInstanceOf(ErrorsException);
                const ex = e as ErrorsException<TestIssue>;
                expect(ex.errors).toHaveLength(1);
                expect(ex.errors[0].message).toContain("Expected errors but got value");
                expect(ex.warnings).toEqual([w1]);
            }
        });
    });

    describe("errorObjectOrThrow", () => {
        it("returns error object when error branch", () => {
            const e1 = err("bad");
            const w1 = err("warn");
            expect(errorObjectOrThrow(errors(e1, undefined, [w1], "ref-1"))).toEqual({
                errors: [e1],
                warnings: [w1],
                reference: "ref-1",
            });
        });

        it("throws when value branch", () => {
            expect(() => errorObjectOrThrow(value(123))).toThrow(ErrorsException);
        });
    });

    describe("makeErrorFromException", () => {
        it("creates an error from an Error instance", () => {
            const result = makeErrorFromException<TestIssue>("loading config", new Error("boom"));
            expect(result).toEqual({
                errors: [
                    {
                        message: "loading config error boom",
                    },
                ],
            });
        });

        it("creates an error from a non-Error thrown value", () => {
            const result = makeErrorFromException<TestIssue>("loading config", "boom");
            expect(result).toEqual({
                errors: [
                    {
                        message: "loading config error boom",
                    },
                ],
            });
        });

        it("puts extras into context when provided", () => {
            const result = makeErrorFromException<TestIssue>("loading config", "boom", {file: "x"});
            expect(result).toEqual({
                errors: [
                    {
                        message: "loading config error boom",
                        context: {file: "x"},
                    },
                ],
            });
        });
    });

    describe("mapErrorsOr", () => {
        it("maps the value when success", () => {
            const result = mapErrorsOr(value(2), (n) => n * 3);
            expect(result).toEqual({value: 6});
        });

        it("preserves warnings when mapping a value", () => {
            const w1 = err("warn");
            const result = mapErrorsOr(value(2, [w1]), (n) => n * 3);
            expect(result).toEqual({value: 6, warnings: [w1]});
        });

        it("identity mapping preserves value and warnings", () => {
            const w1 = err("warn");
            const input = value(2, [w1]);
            expect(mapErrorsOr(input, (x) => x)).toEqual(input);
        });

        it("passes errors through unchanged", () => {
            const e1 = err("bad");
            const w1 = err("warn");
            const result = mapErrorsOr(errors(e1, undefined, [w1], "ref-1"), (n: number) => n * 3);
            expect(result).toEqual({errors: [e1], warnings: [w1], reference: "ref-1"});
        });
    });

    describe("flatMapErrorsOr", () => {
        it("passes errors through unchanged", () => {
            const e1 = err("bad");
            const w1 = err("warn");
            const input = errors(e1, undefined, [w1], "ref-1");
            const result = flatMapErrorsOr(input, (n: number) => value(n * 2));
            expect(result).toEqual(input);
        });

        it("maps value to value", () => {
            const result = flatMapErrorsOr(value(2), (n) => value(n * 4));
            expect(result).toEqual({value: 8});
        });

        it("accumulates warnings when value maps to value with warnings", () => {
            const w1 = err("warn-1");
            const w2 = err("warn-2");
            const result = flatMapErrorsOr(value(2, [w1]), (n) => value(n * 4, [w2]));
            expect(result).toEqual({value: 8, warnings: [w1, w2]});
        });

        it("preserves warnings when value maps to value without warnings", () => {
            const w1 = err("warn-1");
            const result = flatMapErrorsOr(value(2, [w1]), (n) => value(n * 4));
            expect(result).toEqual({value: 8, warnings: [w1]});
        });

        it("accumulates warnings when value maps to errors", () => {
            const w1 = err("warn-1");
            const e1 = err("bad-1");
            const w2 = err("warn-2");
            const result = flatMapErrorsOr(value(2, [w1]), () => errors(e1, undefined, [w2], "ref-2"));
            expect(result).toEqual({
                errors: [e1],
                warnings: [w1, w2],
                reference: "ref-2",
            });
        });

        it("does not invent a reference when downstream errors do not have one", () => {
            const w1 = err("warn-1");
            const e1 = err("bad-1");
            const result = flatMapErrorsOr(value(2, [w1]), () => errors(e1));
            expect(result).toEqual({
                errors: [e1],
                warnings: [w1],
            });
        });
    });

    describe("mapErrorsOrK", () => {
        it("maps async value", async () => {
            const result = await mapErrorsOrK(value(2), async (n) => n * 5);
            expect(result).toEqual({value: 10});
        });

        it("preserves warnings when mapping async value", async () => {
            const w1 = err("warn");
            const result = await mapErrorsOrK(value(2, [w1]), async (n) => n * 5);
            expect(result).toEqual({value: 10, warnings: [w1]});
        });

        it("passes errors through unchanged", async () => {
            const e1 = err("bad");
            const w1 = err("warn");
            const input = errors(e1, undefined, [w1], "ref-1");
            const result = await mapErrorsOrK(input, async (n: number) => n * 5);
            expect(result).toEqual(input);
        });
    });

    describe("flatMapErrorsOrK", () => {
        it("maps async value to value", async () => {
            const result = await flatMapErrorsOrK(value(2), async (n) => value(n * 6));
            expect(result).toEqual({value: 12});
        });

        it("accumulates warnings async", async () => {
            const w1 = err("warn-1");
            const w2 = err("warn-2");
            const result = await flatMapErrorsOrK(value(2, [w1]), async (n) => value(n * 6, [w2]));
            expect(result).toEqual({value: 12, warnings: [w1, w2]});
        });

        it("accumulates warnings when async result is errors", async () => {
            const w1 = err("warn-1");
            const e1 = err("bad");
            const w2 = err("warn-2");
            const result = await flatMapErrorsOrK(value(2, [w1]), async () => errors(e1, undefined, [w2], "ref-3"));
            expect(result).toEqual({
                errors: [e1],
                warnings: [w1, w2],
                reference: "ref-3",
            });
        });

        it("passes through input errors unchanged", async () => {
            const e1 = err("bad");
            const input = errors(e1, undefined, undefined, "ref-1");
            const result = await flatMapErrorsOrK(input, async (n: number) => value(n * 6));
            expect(result).toEqual(input);
        });
    });

    describe("recover", () => {
        it("returns the value when successful", () => {
            expect(recover(value(7), () => 99)).toBe(7);
        });

        it("uses fallback when errors", () => {
            const e1 = err("bad");
            const w1 = err("warn");
            const result = recover(errors(e1, undefined, [w1]), (e) => e.errors.length + (e.warnings?.length ?? 0));
            expect(result).toBe(2);
        });
    });

    describe("flattenArrayOfErrorsOr", () => {
        it("returns empty successful array for empty input", () => {
            expect(flattenArrayOfErrorsOr([])).toEqual({value: []});
        });

        it("returns values when all entries are values", () => {
            const w1 = err("warn-1");
            const w2 = err("warn-2");
            const result = flattenArrayOfErrorsOr([
                value(1, [w1]),
                value(2),
                value(3, [w2]),
            ]);
            expect(result).toEqual({
                value: [1, 2, 3],
                warnings: [w1, w2],
            });
        });

        it("returns errors when any entry is an error and accumulates warnings", () => {
            const e1 = err("bad-1");
            const e2 = err("bad-2");
            const w1 = err("warn-1");
            const w2 = err("warn-2");
            const result = flattenArrayOfErrorsOr([
                value(1, [w1]),
                errors(e1),
                errors(e2, undefined, [w2]),
                value(4),
            ]);
            expect(result).toEqual({
                errors: [e1, e2],
                warnings: [w1, w2],
            });
        });

        it("returns value without warnings when none exist", () => {
            expect(flattenArrayOfErrorsOr([value(1), value(2)])).toEqual({value: [1, 2]});
        });
    });

    describe("flattenRecordOfErrorsOr", () => {
        it("returns empty successful record for empty input", () => {
            expect(flattenRecordOfErrorsOr({})).toEqual({value: {}});
        });

        it("returns record of values when all succeed", () => {
            const w1 = err("warn-1");
            const result = flattenRecordOfErrorsOr({
                a: value(1, [w1]),
                b: value("x"),
            });
            expect(result).toEqual({
                value: {a: 1, b: "x"},
                warnings: [w1],
            });
        });

        it("returns errors when any entry fails and accumulates warnings", () => {
            const e1 = err("bad-1");
            const e2 = err("bad-2");
            const w1 = err("warn-1");
            const w2 = err("warn-2");

            const result = flattenRecordOfErrorsOr({
                a: value(1, [w1]),
                b: errors(e1),
                c: errors(e2, undefined, [w2]),
            });

            expect(result).toEqual({
                errors: [e1, e2],
                warnings: [w1, w2],
            });
        });
    });

    describe("partitionNameAndErrorsOr", () => {
        it("partitions values errors and warnings", () => {
            const e1 = err("bad");
            const w1 = err("warn-1");
            const w2 = err("warn-2");

            const input = {
                a: value(1, [w1]),
                b: errors(e1, undefined, [w2]),
                c: value(3),
            };

            expect(partitionNameAndErrorsOr(input)).toEqual({
                values: {a: 1, c: 3},
                errors: [e1],
                warnings: [w1, w2],
            });
        });

        it("returns empty collections when given empty input", () => {
            expect(partitionNameAndErrorsOr({})).toEqual({
                values: {},
                errors: [],
                warnings: [],
            });
        });
    });

    describe("type aliases compile", () => {
        it("supports AsyncErrorCall type", async () => {
            const fn: AsyncErrorCall<number, string, TestIssue> = async (n) => value(String(n));
            await expect(fn(12)).resolves.toEqual({value: "12"});
        });

        it("supports AsyncErrorCall2 type", async () => {
            const fn: AsyncErrorCall2<number, number, string, TestIssue> = async (a, b) => value(String(a + b));
            await expect(fn(2, 3)).resolves.toEqual({value: "5"});
        });
    });
});
describe("flatmapArrayOfArrayOfErrorsOr", () => {
    it("returns empty successful array for empty input", () => {
        const result = flatmapArrayOfArrayOfErrorsOr([], (n: number) => value(n * 2));
        expect(result).toEqual({value: []});
    });

    it("maps a 2d array when all entries succeed", () => {
        const w1 = err("warn-1");
        const w2 = err("warn-2");

        const result = flatmapArrayOfArrayOfErrorsOr(
            [
                [1, 2],
                [3]
            ],
            n => n === 1
                ? value(n * 10, [w1])
                : n === 3
                    ? value(n * 10, [w2])
                    : value(n * 10)
        );

        expect(result).toEqual({
            value: [
                [10, 20],
                [30]
            ],
            warnings: [w1, w2]
        });
    });

    it("returns errors from a single inner array and preserves warnings", () => {
        const e1 = err("bad-2");
        const w1 = err("warn-1");

        const result = flatmapArrayOfArrayOfErrorsOr(
            [
                [1, 2],
                [3]
            ],
            n => n === 1
                ? value(n * 10, [w1])
                : n === 2
                    ? errors(e1)
                    : value(n * 10)
        );

        expect(result).toEqual({
            errors: [e1],
            warnings: [w1]
        });
    });

    it("collects errors across multiple inner arrays and preserves warnings", () => {
        const e1 = err("bad-2");
        const e2 = err("bad-4");
        const w1 = err("warn-1");
        const w2 = err("warn-3");

        const result = flatmapArrayOfArrayOfErrorsOr(
            [
                [1, 2],
                [3, 4]
            ],
            n => n === 1
                ? value(n * 10, [w1])
                : n === 2
                    ? errors(e1)
                    : n === 3
                        ? value(n * 10, [w2])
                        : errors(e2)
        );

        expect(result).toEqual({
            errors: [e1, e2],
            warnings: [w1, w2]
        });
    });

    it("preserves empty inner arrays when all entries succeed", () => {
        const result = flatmapArrayOfArrayOfErrorsOr(
            [
                [],
                [1],
                []
            ],
            n => value(n * 2)
        );

        expect(result).toEqual({
            value: [
                [],
                [2],
                []
            ]
        });
    });
});
describe("mapBaseIssue", () => {
    it("maps a successful value", () => {
        const actual = mapBaseIssue(
            value(2),
            n => n * 10
        );

        expect(actual).toEqual(value(20));
    });

    it("preserves warnings when mapping a successful value", () => {
        const w1 = err("warn-1");

        const actual = mapBaseIssue(
            value(2, [w1]),
            n => n * 10
        );

        expect(actual).toEqual(value(20, [w1]));
    });

    it("passes errors through unchanged", () => {
        const e1 = err("bad-1");

        const actual = mapBaseIssue(
            errors(e1),
            n => n +'...'
        );

        expect(actual).toEqual(errors(e1));
    });
});

describe("flatMapBaseIssue", () => {
    it("flat maps a successful value", () => {
        const actual = flatMapBaseIssue(
            value(2),
            n => value(n * 10)
        );

        expect(actual).toEqual(value(20));
    });

    it("preserves warnings from both sides when flat mapping a successful value", () => {
        const w1 = err("warn-1");
        const w2 = err("warn-2");

        const actual = flatMapBaseIssue(
            value(2, [w1]),
            n => value(n * 10, [w2])
        );

        expect(actual).toEqual(value(20, [w1, w2]));
    });

    it("passes input errors through unchanged", () => {
        const e1 = err("bad-1");

        const actual = flatMapBaseIssue(
            errors(e1),
            n => value(n +'..')
        );

        expect(actual).toEqual(errors(e1));
    });

    it("returns errors from the mapping function", () => {
        const e1 = err("bad-2");

        const actual = flatMapBaseIssue(
            value(2),
            _ => errors(e1)
        );

        expect(actual).toEqual(errors(e1));
    });

    it("preserves input warnings when the mapping function returns errors", () => {
        const w1 = err("warn-1");
        const e1 = err("bad-2");

        const actual = flatMapBaseIssue(
            value(2, [w1]),
            _ => errors(e1)
        );

        expect(actual).toEqual({
            errors: [e1],
            warnings: [w1]
        });
    });
});
