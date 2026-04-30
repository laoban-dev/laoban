import { NameAnd } from "@laoban/records";
import { safeJson } from "@laoban/safe";

export type BaseIssue<K = unknown, C = unknown> = {
    kind?: K;
    message: string;
    context?: C;
    code?: string;
    severity?: "error" | "warning";
};

export type Value<T, E extends BaseIssue = BaseIssue> = {
    value: T;
    warnings?: E[];
};

export type Errors<E extends BaseIssue = BaseIssue> = {
    errors: E[];
    warnings?: E[];
    reference?: string;
};

export type ErrorsOr<T, E extends BaseIssue = BaseIssue> =
    | Errors<E>
    | Value<T, E>;

export const value = <T, E extends BaseIssue = BaseIssue>(
    t: T,
    warnings?: E[],
): ErrorsOr<T, E> =>
    warnings && warnings.length > 0 ? { value: t, warnings } : { value: t };

export const errors = <E extends BaseIssue = BaseIssue>(
    first: E,
    rest?: E[],
    warnings?: E[],
    reference?: string,
): Errors<E> => {
    const allErrors = [first, ...(rest ?? [])];
    return {
        errors: allErrors,
        ...(warnings && warnings.length > 0 ? { warnings } : {}),
        ...(reference !== undefined ? { reference } : {}),
    };
};

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

export function isValue<T, E extends BaseIssue = BaseIssue>(e: unknown): e is Value<T, E> {
    return e !== null && typeof e === "object" && "value" in e;
}

export function isErrors<T, E extends BaseIssue = BaseIssue>(e: unknown): e is Errors<E> {
    return e !== null && typeof e === "object" && "errors" in e;
}

function assertErrorsOr<T, E extends BaseIssue = BaseIssue>(
    e: unknown,
    message: string,
): asserts e is ErrorsOr<T, E> {
    if (e === undefined || e === null || (!isValue(e) && !isErrors(e))) {
        throw new Error(message);
    }
}

export function warnings<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): E[] {
    return e.warnings ?? [];
}

export function valueOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): T {
    if (isErrors(e)) throw new ErrorsException(e.errors, e.warnings, e.reference);
    return e.value;
}

export const valueOrDefault = <T, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    defaultValue: T,
): T => {
    if (isErrors(e)) return defaultValue;
    const v = e.value;
    return v === null || v === undefined ? defaultValue : v;
};

export function errorsOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): E[] {
    if (isValue(e)) {
        throw new ErrorsException(
            [{ message: `Expected errors but got value ${safeJson(e)}` } as E],
            e.warnings,
        );
    }
    return e.errors;
}

export function errorObjectOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): Errors<E> {
    if (isValue(e)) {
        throw new ErrorsException(
            [{ message: `Expected errors but got value ${safeJson(e)}` } as E],
            e.warnings,
        );
    }
    return e;
}

export function makeErrorFromException<E extends BaseIssue = BaseIssue>(
    context: string,
    err: unknown,
    extras?: unknown,
): Errors<E> {
    const message = err instanceof Error ? err.message : String(err);
    const issue: BaseIssue = {
        message: `${context} error ${message}`,
        ...(extras !== undefined ? { context: extras } : {}),
    };
    return { errors: [issue as E] };
}

export function mapErrorsOr<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => T1,
): ErrorsOr<T1, E> {
    if (isValue(e)) {
        const mapped = f(e.value);
        return e.warnings && e.warnings.length > 0
            ? { value: mapped, warnings: e.warnings }
            : { value: mapped };
    }
    return e;
}

export function flatMapErrorsOr<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => ErrorsOr<T1, E>,
): ErrorsOr<T1, E> {
    if (isErrors(e)) return e;

    const next = f(e.value);

    assertErrorsOr<T1, E>(
        next,
        `flatMapErrorsOr mapper returned invalid ErrorsOr ${safeJson(next)}`,
    );

    const combinedWarnings = append<E>(e.warnings, next.warnings);

    if (isValue(next)) {
        return combinedWarnings ? { value: next.value, warnings: combinedWarnings } : { value: next.value };
    }

    return {
        errors: next.errors,
        ...(combinedWarnings ? { warnings: combinedWarnings } : {}),
        ...(next.reference !== undefined ? { reference: next.reference } : {}),
    };
}

export function mapErrorsOrK<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => Promise<T1>,
): Promise<ErrorsOr<T1, E>> {
    if (isErrors(e)) return Promise.resolve(e as ErrorsOr<T1, E>);
    return f(e.value).then((v) =>
        e.warnings && e.warnings.length > 0 ? { value: v, warnings: e.warnings } : { value: v },
    );
}

export function flatMapErrorsOrK<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => Promise<ErrorsOr<T1, E>>,
): Promise<ErrorsOr<T1, E>> {
    if (isErrors(e)) return Promise.resolve(e as ErrorsOr<T1, E>);

    return f(e.value).then((next) => {
        assertErrorsOr<T1, E>(
            next,
            `flatMapErrorsOrK mapper resolved to invalid ErrorsOr ${safeJson(next)}`,
        );

        const combinedWarnings = append<E>(e.warnings, next.warnings);

        if (isValue(next)) {
            return combinedWarnings ? { value: next.value, warnings: combinedWarnings } : { value: next.value };
        }

        return {
            errors: next.errors,
            ...(combinedWarnings ? { warnings: combinedWarnings } : {}),
            ...(next.reference !== undefined ? { reference: next.reference } : {}),
        };
    });
}

export function recover<T, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (e: Errors<E>) => T,
): T {
    if (isErrors(e)) return f(e);
    return e.value;
}

export type AsyncErrorCall<From, To, E extends BaseIssue = BaseIssue> = (
    from: From,
) => Promise<ErrorsOr<To, E>>;

export type AsyncErrorCall2<From1, From2, To, E extends BaseIssue = BaseIssue> = (
    from1: From1,
    from2: From2,
) => Promise<ErrorsOr<To, E>>;

export function sequenceArrayErrorsOr<T, E extends BaseIssue = BaseIssue>(
    es: ErrorsOr<T, E>[],
): ErrorsOr<T[], E> {
    const values: T[] = [];
    const allErrors: E[] = [];
    const allWarnings: E[] = [];

    for (const e of es) {
        assertErrorsOr<T, E>(
            e,
            `sequenceArrayErrorsOr item was invalid ErrorsOr ${safeJson(e)}`,
        );

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
            ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
        };
    }

    return allWarnings.length > 0 ? { value: values, warnings: allWarnings } : { value: values };
}

/**
 * @deprecated Use sequenceArrayErrorsOr.
 */
export function flattenArrayOfErrorsOr<T, E extends BaseIssue = BaseIssue>(
    es: ErrorsOr<T, E>[],
): ErrorsOr<T[], E> {
    return sequenceArrayErrorsOr(es);
}

export async function sequenceArrayErrorsOrK<T, E extends BaseIssue = BaseIssue>(
    es: Promise<ErrorsOr<T, E>>[],
): Promise<ErrorsOr<T[], E>> {
    const results = await Promise.all(
        es.map(async (item, index) => {
            const result = await item;

            assertErrorsOr<T, E>(
                result,
                `sequenceArrayErrorsOrK promise resolved to invalid ErrorsOr ${safeJson(result)} at index ${index}`,
            );

            return result;
        }),
    );

    return sequenceArrayErrorsOr(results);
}

/**
 * @deprecated Use sequenceArrayErrorsOrK.
 */
export function flattenArrayOfErrorsOrK<T, E extends BaseIssue = BaseIssue>(
    es: Promise<ErrorsOr<T, E>>[],
): Promise<ErrorsOr<T[], E>> {
    return sequenceArrayErrorsOrK(es);
}

export function traverseArrayErrorsOr<T, U, E extends BaseIssue = BaseIssue>(
    arr: T[],
    fn: (t: T) => ErrorsOr<U, E>,
): ErrorsOr<U[], E> {
    return sequenceArrayErrorsOr(
        arr.map((item, index) => {
            const result = fn(item);

            assertErrorsOr<U, E>(
                result,
                `traverseArrayErrorsOr mapper returned invalid ErrorsOr ${safeJson(result)} at index ${index}. Item: ${safeJson(item)}`,
            );

            return result;
        }),
    );
}

export async function traverseArrayErrorsOrK<T, U, E extends BaseIssue = BaseIssue>(
    arr: T[],
    fn: (t: T) => Promise<ErrorsOr<U, E>>,
): Promise<ErrorsOr<U[], E>> {
    return sequenceArrayErrorsOrK(
        arr.map(async (item, index) => {
            const result = await fn(item);

            assertErrorsOr<U, E>(
                result,
                `traverseArrayErrorsOrK mapper resolved to invalid ErrorsOr ${safeJson(result)} at index ${index}. Item: ${safeJson(item)}`,
            );

            return result;
        }),
    );
}

export function traverseNestedArrayErrorsOr<G, H, E extends BaseIssue = BaseIssue>(
    inp: G[][],
    fn: (g: G) => ErrorsOr<H, E>,
): ErrorsOr<H[][], E> {
    return traverseArrayErrorsOr(inp, (inner) =>
        traverseArrayErrorsOr(inner, fn),
    );
}

/**
 * @deprecated Use traverseNestedArrayErrorsOr.
 */
export function flatmapArrayOfArrayOfErrorsOr<G, H, E extends BaseIssue = BaseIssue>(
    inp: G[][],
    fn: (g: G) => ErrorsOr<H, E>,
): ErrorsOr<H[][], E> {
    return traverseNestedArrayErrorsOr(inp, fn);
}

type UnwrapErrorsOr<X> = X extends ErrorsOr<infer T, any> ? T : never;

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

        assertErrorsOr<UnwrapErrorsOr<R[typeof key]>, E>(
            v,
            `flattenRecordOfErrorsOr entry '${String(key)}' was invalid ErrorsOr ${safeJson(v)}`,
        );

        if (isValue(v)) {
            out[key] = v.value as UnwrapErrorsOr<R[typeof key]>;
            if (v.warnings) allWarnings.push(...v.warnings);
        } else {
            allErrors.push(...v.errors);
            if (v.warnings) allWarnings.push(...v.warnings);
        }
    }

    if (allErrors.length > 0) {
        return {
            errors: allErrors,
            ...(allWarnings.length > 0 ? { warnings: allWarnings } : {}),
        };
    }

    return allWarnings.length > 0 ? { value: out as Out, warnings: allWarnings } : { value: out as Out };
}

export function partitionNameAndErrorsOr<T, E extends BaseIssue = BaseIssue>(
    es: NameAnd<ErrorsOr<T, E>>,
): { values: NameAnd<T>; errors: E[]; warnings: E[] } {
    const values: NameAnd<T> = {};
    const allErrors: E[] = [];
    const allWarnings: E[] = [];

    for (const [name, result] of Object.entries(es)) {
        assertErrorsOr<T, E>(
            result,
            `partitionNameAndErrorsOr entry '${name}' was invalid ErrorsOr ${safeJson(result)}`,
        );

        if (isValue(result)) {
            values[name] = result.value;
            if (result.warnings) allWarnings.push(...result.warnings);
        } else {
            allErrors.push(...result.errors);
            if (result.warnings) allWarnings.push(...result.warnings);
        }
    }

    return { values, errors: allErrors, warnings: allWarnings };
}

function append<E>(...items: (E[] | undefined)[]): E[] | undefined {
    const result: E[] = [];
    for (const item of items) {
        if (item && item.length > 0) result.push(...item);
    }
    return result.length > 0 ? result : undefined;
}

export function flatMapBaseIssue<G, H, E1 extends BaseIssue, E2 extends BaseIssue>(
    inp: ErrorsOr<G, E1>,
    fn: (g: G) => ErrorsOr<H, E2>,
): ErrorsOr<H, BaseIssue> {
    return flatMapErrorsOr(
        inp as ErrorsOr<G, BaseIssue>,
        (g) => fn(g) as ErrorsOr<H, BaseIssue>,
    );
}

export async function flatMapBaseIssueK<G, H, E1 extends BaseIssue, E2 extends BaseIssue>(
    inp: ErrorsOr<G, E1>,
    fn: (g: G) => Promise<ErrorsOr<H, E2>>,
): Promise<ErrorsOr<H, BaseIssue>> {
    return flatMapErrorsOrK(inp, (g) => fn(g) as Promise<ErrorsOr<H, BaseIssue>>);
}

export function mapBaseIssue<G, H, E extends BaseIssue>(
    inp: ErrorsOr<G, E>,
    fn: (g: G) => H,
): ErrorsOr<H, BaseIssue> {
    return mapErrorsOr(
        inp as ErrorsOr<G, BaseIssue>,
        fn,
    );
}

export async function mapBaseIssueK<G, H, E extends BaseIssue>(
    inp: ErrorsOr<G, E>,
    fn: (g: G) => Promise<H>,
): Promise<ErrorsOr<H, BaseIssue>> {
    return mapErrorsOrK(
        inp as ErrorsOr<G, BaseIssue>,
        fn,
    );
}

/**
 * @deprecated Use traverseArrayErrorsOrK.
 */
export function mapArrayK<T, T1, E extends BaseIssue>(
    arr: T[],
    fn: (t: T) => Promise<ErrorsOr<T1, E>>,
): Promise<ErrorsOr<T1[], E>> {
    return traverseArrayErrorsOrK(arr, fn);
}