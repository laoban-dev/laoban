import {NameAnd} from "@laoban/records";
import {safeJson} from "@laoban/safe";

/**
 * Base shape for issues carried by ErrorsOr.
 *
 * K is the kind of issue, and C is the context payload.
 * Both are intentionally generic so this library stays reusable.
 */
export type BaseIssue<K = unknown, C = unknown> = {
    kind?: K;
    message: string;
    context?: C;
    code?: string;
    severity?: "error" | "warning";
};

/**
 * Successful result, optionally carrying warnings.
 */
export type Value<T, E extends BaseIssue = BaseIssue> = {
    value: T;
    warnings?: E[];
};

/**
 * Failed result, carrying one or more errors and optionally warnings.
 */
export type Errors<E extends BaseIssue = BaseIssue> = {
    errors: E[];
    warnings?: E[];
    reference?: string;
};

/**
 * Represents either a successful value or a set of errors.
 */
export type ErrorsOr<T, E extends BaseIssue = BaseIssue> =
    | Errors<E>
    | Value<T, E>;

/**
 * Wrap a successful value, optionally carrying warnings.
 */
export const value = <T, E extends BaseIssue = BaseIssue>(
    t: T,
    warnings?: E[],
): ErrorsOr<T, E> => (warnings && warnings.length > 0 ? {value: t, warnings} : {value: t});

/**
 * Wrap one or more errors, optionally carrying warnings and a reference.
 *
 * The first error is mandatory to avoid constructing empty error objects accidentally.
 */
export const errors = <E extends BaseIssue = BaseIssue>(
    first: E,
    rest?: E[],
    warnings?: E[],
    reference?: string,
): Errors<E> => {
    const allErrors = [first, ...(rest ?? [])];
    return {
        errors: allErrors,
        ...(warnings && warnings.length > 0 ? {warnings} : {}),
        ...(reference !== undefined ? {reference} : {}),
    };
};


/**
 * Exception type used to throw structured errors.
 */
export class ErrorsException<E extends BaseIssue = BaseIssue> extends Error {
    constructor(
        public errors: E[],
        public warnings?: E[],
        public reference?: string,
    ) {
        super(errors.map((e) => e.message).join(", "));
        this.name = "ErrorsException";
    }
}

/**
 * Type guard to check if an ErrorsOr contains a value.
 */
export function isValue<T, E extends BaseIssue = BaseIssue>(e: any): e is Value<T, E> {
    return e !== null && typeof e === "object" && "value" in e;
}

/**
 * Type guard to check if an ErrorsOr contains errors.
 */
export function isErrors<T, E extends BaseIssue = BaseIssue>(e: any): e is Errors<E> {
    return e !== null && typeof e === "object" && "errors" in e;
}

/**
 * Extract warnings from either branch.
 *
 * Returns an empty array if there are no warnings.
 */
export function warnings<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): E[] {
    return e.warnings ?? [];
}

/**
 * Extract the wrapped value or throw an ErrorsException if errors are present.
 */
export function valueOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): T {
    if (isErrors(e)) throw new ErrorsException(e.errors, e.warnings, e.reference);
    return e.value;
}

/**
 * Returns the wrapped value, or a default if errors exist or if the value is null/undefined.
 */
export const valueOrDefault = <T, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    defaultValue: T,
): T => {
    if (isErrors(e)) return defaultValue;
    const v = e?.value;
    return v === null || v === undefined ? defaultValue : v;
};

/**
 * Extract errors or throw if a value is present unexpectedly.
 */
export function errorsOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): E[] {
    if (isValue(e)) {
        throw new ErrorsException(
            [
                {
                    message: `Expected errors but got value ${safeJson(e)}`,
                } as E,
            ],
            e.warnings,
        );
    }
    return e.errors;
}

/**
 *
 * Extract the Errors object or throw if a value is present unexpectedly.
 */
export function errorObjectOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): Errors<E> {
    if (isValue(e)) {
        throw new ErrorsException(
            [
                {
                    message: `Expected errors but got value ${safeJson(e)}`,
                } as E,
            ],
            e.warnings,
        );
    }
    return e;
}

/**
 * Creates an Errors object from an exception or unknown thrown value.
 *
 * This is intended as a boundary helper for exception-based code.
 */
export function makeErrorFromException<E extends BaseIssue = BaseIssue>(
    context: string,
    err: unknown,
    extras?: unknown,
): Errors<E> {
    const message = err instanceof Error ? err.message : String(err);
    const issue: BaseIssue = {
        message: `${context} error ${message}`,
        ...(extras !== undefined ? {context: extras} : {}),
    };
    return {errors: [issue as E]};
}

/**
 * Applies a transform function to the wrapped value, preserving warnings.
 */
export function mapErrorsOr<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => T1,
): ErrorsOr<T1, E> {
    if (isValue(e)) {
        const mapped = f(e.value);
        return e.warnings && e.warnings.length > 0
            ? {value: mapped, warnings: e.warnings}
            : {value: mapped};
    }
    return e;
}

/**
 * Applies a transform that returns ErrorsOr to the wrapped value, flattening the result.
 *
 * Warnings are preserved and accumulated.
 */
export function flatMapErrorsOr<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => ErrorsOr<T1, E>,
): ErrorsOr<T1, E> {
    if (isErrors(e)) return e;

    const next = f(e.value);
    const combinedWarnings = append<E>(e.warnings, next.warnings);

    if (isValue(next)) {
        return combinedWarnings ? {value: next.value, warnings: combinedWarnings} : {value: next.value};
    }

    return {
        errors: next.errors,
        ...(combinedWarnings ? {warnings: combinedWarnings} : {}),
        ...(next.reference !== undefined ? {reference: next.reference} : {}),
    };
}

/**
 * Asynchronously transforms the wrapped value, preserving warnings.
 */
export function mapErrorsOrK<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => Promise<T1>,
): Promise<ErrorsOr<T1, E>> {
    if (isErrors(e)) return Promise.resolve(e as ErrorsOr<T1, E>);
    return f(e.value).then((v) =>
        e.warnings && e.warnings.length > 0 ? {value: v, warnings: e.warnings} : {value: v},
    );
}

/**
 * Asynchronously flatMaps the wrapped value, preserving and accumulating warnings.
 */
export function flatMapErrorsOrK<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => Promise<ErrorsOr<T1, E>>,
): Promise<ErrorsOr<T1, E>> {
    if (isErrors(e)) return Promise.resolve(e as ErrorsOr<T1, E>);

    return f(e.value).then((next) => {
        const combinedWarnings = append<E>(e.warnings, next.warnings);

        if (isValue(next)) {
            return combinedWarnings ? {value: next.value, warnings: combinedWarnings} : {value: next.value};
        }

        return {
            errors: next.errors,
            ...(combinedWarnings ? {warnings: combinedWarnings} : {}),
            ...(next.reference !== undefined ? {reference: next.reference} : {}),
        };
    });
}

/**
 * Recovers from errors by applying a fallback function, or returns the value if present.
 */
export function recover<T, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (e: Errors<E>) => T,
): T {
    if (isErrors(e)) return f(e);
    return e.value;
}

/**
 * Represents an asynchronous function from a single input to an ErrorsOr result.
 */
export type AsyncErrorCall<From, To, E extends BaseIssue = BaseIssue> = (
    from: From,
) => Promise<ErrorsOr<To, E>>;

/**
 * Represents an asynchronous function from two inputs to an ErrorsOr result.
 */
export type AsyncErrorCall2<From1, From2, To, E extends BaseIssue = BaseIssue> = (
    from1: From1,
    from2: From2,
) => Promise<ErrorsOr<To, E>>;

/**
 * Flatten an array of ErrorsOr values into a single ErrorsOr of an array.
 *
 * - All successful values are collected.
 * - All errors are accumulated.
 * - All warnings are accumulated.
 * - If any errors exist, the result is Errors.
 * - Otherwise the result is Value.
 */
export function flattenArrayOfErrorsOr<T, E extends BaseIssue = BaseIssue>(
    es: ErrorsOr<T, E>[],
): ErrorsOr<T[], E> {
    const values: T[] = [];
    const allErrors: E[] = [];
    const allWarnings: E[] = [];

    for (const e of es) {
        if (isValue(e)) {
            values.push(e.value);
            if (e.warnings) allWarnings.push(...e.warnings);
        } else {
            allErrors.push(...e.errors);
            if (e.warnings) allWarnings.push(...e.warnings);
        }
    }

    if (allErrors.length > 0) {
        return {
            errors: allErrors,
            ...(allWarnings.length > 0 ? {warnings: allWarnings} : {}),
        };
    }

    return allWarnings.length > 0 ? {value: values, warnings: allWarnings} : {value: values};
}

export function flatmapArrayOfArrayOfErrorsOr<G, H, E extends BaseIssue>(
    inp: G[][],
    fn: (g: G) => ErrorsOr<H, E>
): ErrorsOr<H[][], E> {
    return flattenArrayOfErrorsOr(
        inp.map(inner =>
            flattenArrayOfErrorsOr(
                inner.map(fn)
            )
        )
    );
}

type UnwrapErrorsOr<X> = X extends ErrorsOr<infer T, any> ? T : never;

/**
 * Flatten a record of ErrorsOr values into a single ErrorsOr of a record,
 * preserving the original keys.
 *
 * - If any entry is Errors, aggregates all errors.
 * - Aggregates all warnings from both branches.
 * - Otherwise returns Value<Record<same keys, unwrapped values>>.
 */
export function flattenRecordOfErrorsOr<
    R extends Record<string, ErrorsOr<any, E>>,
    E extends BaseIssue = BaseIssue
>(
    rs: R,
): ErrorsOr<{ [K in keyof R]: UnwrapErrorsOr<R[K]> }, E> {
    type Out = { [K in keyof R]: UnwrapErrorsOr<R[K]> };

    const out: Partial<Out> = {};
    const allErrors: E[] = [];
    const allWarnings: E[] = [];

    for (const k in rs) {
        if (!Object.prototype.hasOwnProperty.call(rs, k)) continue;

        const key = k as keyof R;
        const v = rs[key];

        if (isValue(v)) {
            out[key] = v.value as UnwrapErrorsOr<R[typeof key]>;
            if (v.warnings) allWarnings.push(...v.warnings);
        } else if (isErrors(v)) {
            allErrors.push(...v.errors);
            if (v.warnings) allWarnings.push(...v.warnings);
        } else {
            throw new Error("Expected ErrorsOr value but got " + safeJson(v));
        }
    }

    if (allErrors.length > 0) {
        return {
            errors: allErrors,
            ...(allWarnings.length > 0 ? {warnings: allWarnings} : {}),
        };
    }

    return allWarnings.length > 0 ? {value: out as Out, warnings: allWarnings} : {value: out as Out};
}

/**
 * Splits a record of named ErrorsOr<T> into successful values, aggregated errors, and warnings.
 *
 * This is useful when callers want partial success information rather than one combined ErrorsOr.
 */
export function partitionNameAndErrorsOr<T, E extends BaseIssue = BaseIssue>(
    es: NameAnd<ErrorsOr<T, E>>,
): { values: NameAnd<T>; errors: E[]; warnings: E[] } {
    const values: NameAnd<T> = {};
    const allErrors: E[] = [];
    const allWarnings: E[] = [];

    for (const [name, result] of Object.entries(es)) {
        if (isValue(result)) {
            values[name] = result.value;
            if (result.warnings) allWarnings.push(...result.warnings);
        } else {
            allErrors.push(...result.errors);
            if (result.warnings) allWarnings.push(...result.warnings);
        }
    }

    return {values, errors: allErrors, warnings: allWarnings};
}

/**
 * Append arrays, omitting undefined and empty results.
 */
function append<E>(...items: (E[] | undefined)[]): E[] | undefined {
    const result: E[] = [];
    for (const item of items) {
        if (item && item.length > 0) result.push(...item);
    }
    return result.length > 0 ? result : undefined;
}

export function flatMapBaseIssue<G, H, E1 extends BaseIssue, E2 extends BaseIssue>(
    inp: ErrorsOr<G, E1>,
    fn: (g: G) => ErrorsOr<H, E2>
): ErrorsOr<H, BaseIssue> {
    return flatMapErrorsOr(
        inp as ErrorsOr<G, BaseIssue>,
        g => fn(g) as ErrorsOr<H, BaseIssue>
    );
}

export async function flatMapBaseIssueK<G, H, E1 extends BaseIssue, E2 extends BaseIssue>(
    inp: ErrorsOr<G, E1>,
    fn: (g: G) => Promise<ErrorsOr<H, E2>>
): Promise<ErrorsOr<H, BaseIssue>> {
    return flatMapErrorsOrK(inp, g => fn(g) as Promise<ErrorsOr<H, BaseIssue>>);
}

export function mapBaseIssue<G, H, E extends BaseIssue>(
    inp: ErrorsOr<G, E>,
    fn: (g: G) => H
): ErrorsOr<H, BaseIssue> {
    return mapErrorsOr(
        inp as ErrorsOr<G, BaseIssue>,
        fn
    );
}

export async function mapBaseIssueK<G, H, E extends BaseIssue>(
    inp: ErrorsOr<G, E>,
    fn: (g: G) => Promise<H>
): Promise<ErrorsOr<H, BaseIssue>> {
    return mapErrorsOrK(
        inp as ErrorsOr<G, BaseIssue>,
        fn
    );
}

export async function mapArrayK<T, T1, E extends BaseIssue>(
    arr: T[],
    fn: (t: T) => Promise<ErrorsOr<T1, E>>
): Promise<ErrorsOr<T1[], E>> {
    const results = await Promise.all(arr.map(async (item, index) => {
        const result = await fn(item)

        if (result === undefined || result === null) {
            throw new Error(
                `mapArrayK mapper returned ${result} at index ${index}. Item: ${JSON.stringify(item)}`
            )
        }

        return result
    }))

    return flattenArrayOfErrorsOr(results)
}