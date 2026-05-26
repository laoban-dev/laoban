import { NameAnd } from "@laoban/records";
import { safeJson } from "@laoban/safe";

/**
 * A structured issue that is not necessarily tied to a source file.
 *
 * This is the common shape used throughout Laoban for expected operational
 * failures and warnings. It is intentionally small and open:
 *
 * - `kind` identifies the broad family of issue, such as "validation",
 *   "parseJson", "cycle", or a domain-specific issue kind.
 * - `message` is the human-readable explanation.
 * - `context` is domain-specific structured context. For validation issues,
 *   this is usually a path inside the thing being validated.
 * - `code` is a stable machine-readable reason, such as "required",
 *   "wrong.type", or "deprecated".
 * - `severity` allows warnings and errors to share the same issue shape.
 */
export type CommonIssue<K = unknown, C = unknown> = {
    kind?: K
    message: string
    context?: C
    code?: string
    severity?: "error" | "warning"
}

/**
 * A structured issue associated with a known source file.
 *
 * Use this when the user can fix the problem by opening a specific file.
 *
 * The key convention is:
 *
 * - `diagnosticContext.currentFile` is the source file to show to the user.
 * - `context` remains the location inside that file, if known.
 *
 * For example:
 *
 * fileIssue("packages/foo/package.details.json", {
 *     kind: "validation",
 *     code: "required",
 *     context: ["name"],
 *     message: "name is required but was undefined",
 * })
 *
 * should render as something like:
 *
 * in file packages/foo/package.details.json
 *
 *   name
 *     required: name is required but was undefined
 */
export type FileIssue<K = unknown, C = unknown> = CommonIssue<K, C> & {
    diagnosticContext: DiagnosticContext
}

export type DiagnosticContext = {
    currentFile: string
    loadPath?: string[]
}
/**
 * Any issue the Laoban error model can carry.
 *
 * Most code should continue to work with BaseIssue. Code that knows it is
 * dealing with a file-backed issue can narrow with `isFileIssue`.
 *
 * This keeps the ErrorsOr monad simple:
 *
 *     ErrorsOr<T, E extends BaseIssue = BaseIssue>
 *
 * while still giving file-backed errors a standard shape.
 */
export type BaseIssue<K = unknown, C = unknown> =
    | CommonIssue<K, C>
    | FileIssue<K, C>

/**
 * Create a FileIssue from a normal CommonIssue.
 *
 * Use this at file-aware boundaries: JSON parsing, config validation,
 * package.details.json loading, template file loading, and similar places.
 *
 * Do not put the filename into `context` when using this helper. The file goes
 * in `diagnosticContext.currentFile`; `context` should describe the location
 * inside the file.
 */
export function fileIssue<K = unknown, C = unknown>(
    currentFile: string,
    issue: CommonIssue<K, C>,
    loadPath?: string[],
): FileIssue<K, C> {
    return {
        ...issue,
        diagnosticContext: {
            currentFile,
            ...(loadPath === undefined ? {} : {loadPath}),
        },
    }
}

/**
 * Type guard for issues that are tied to a known source file.
 *
 * Rendering code should use this to decide whether an issue can be displayed
 * in the friendly "in file ..." form.
 */
export function isFileIssue<K = unknown, C = unknown>(
    issue: BaseIssue<K, C>,
): issue is FileIssue<K, C> {
    return typeof (issue as {diagnosticContext?: {currentFile?: unknown}})
        .diagnosticContext
        ?.currentFile === "string"
}
/**
 * Successful result, optionally carrying warnings gathered along the way.
 * Warnings do not prevent the value from being used.
 */
export type Value<T, E extends BaseIssue = BaseIssue> = {
    value: T;
    warnings?: E[];
};

/**
 * Failed result, optionally carrying warnings and a reference for diagnostics.
 * `errors` should always contain at least one issue.
 */
export type Errors<E extends BaseIssue = BaseIssue> = {
    errors: E[];
    warnings?: E[];
    reference?: string;
};

/**
 * Standard Laoban result type.
 * A result is either a value-with-optional-warnings or errors-with-optional-warnings.
 */
export type ErrorsOr<T, E extends BaseIssue = BaseIssue> =
    | Errors<E>
    | Value<T, E>;

/**
 * Construct a successful ErrorsOr result.
 * Use this even when there are warnings; warnings do not make the operation fail.
 */
export const value = <T, E extends BaseIssue = BaseIssue>(
    t: T,
    warnings?: E[],
): ErrorsOr<T, E> =>
    warnings && warnings.length > 0 ? { value: t, warnings } : { value: t };

/**
 * Construct a failed ErrorsOr result from one required error and optional extra errors.
 * Warnings and reference are preserved when supplied.
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
        ...(warnings && warnings.length > 0 ? { warnings } : {}),
        ...(reference !== undefined ? { reference } : {}),
    };
};

/**
 * Exception adapter for test helpers and imperative boundaries.
 * Prefer returning ErrorsOr in core code; throw this only at edges.
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
 * Type guard for successful ErrorsOr results.
 * Narrows to Value<T,E> so `.value` can be read safely.
 */
export function isValue<T, E extends BaseIssue = BaseIssue>(e: unknown): e is Value<T, E> {
    return e !== null && typeof e === "object" && "value" in e;
}

/**
 * Type guard for failed ErrorsOr results.
 * Narrows to Errors<E> so `.errors` can be read safely.
 */
export function isErrors<T, E extends BaseIssue = BaseIssue>(e: unknown): e is Errors<E> {
    return e !== null && typeof e === "object" && "errors" in e;
}

/**
 * Internal defensive check for helper boundaries.
 * Throws if a mapper promised ErrorsOr but returned an invalid shape.
 */
function assertErrorsOr<T, E extends BaseIssue = BaseIssue>(
    e: unknown,
    message: string,
): asserts e is ErrorsOr<T, E> {
    if (e === undefined || e === null || (!isValue(e) && !isErrors(e))) {
        throw new Error(message);
    }
}

/**
 * Return warnings from either a success or failed result.
 * Use this when aggregating warnings independently from errors.
 */
export function warnings<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): E[] {
    return e.warnings ?? [];
}

/**
 * Extract the value or throw ErrorsException.
 * Intended for tests and imperative boundaries, not normal core flow.
 */
export function valueOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): T {
    if (isErrors(e)) throw new ErrorsException(e.errors, e.warnings, e.reference);
    return e.value;
}

/**
 * Extract the value, or return a default for errors/null/undefined values.
 * Useful at tolerant boundaries where failure should collapse to a fallback.
 */
export const valueOrDefault = <T, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    defaultValue: T,
): T => {
    if (isErrors(e)) return defaultValue;
    const v = e.value;
    return v === null || v === undefined ? defaultValue : v;
};

/**
 * Extract errors or throw if the result was successful.
 * Intended for tests that expect a failure.
 */
export function errorsOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): E[] {
    if (isValue(e)) {
        throw new ErrorsException(
            [{ message: `Expected errors but got value ${safeJson(e)}` } as E],
            e.warnings,
        );
    }
    return e.errors;
}

/**
 * Extract the full Errors object or throw if the result was successful.
 * Use when tests need warnings/reference as well as errors.
 */
export function errorObjectOrThrow<T, E extends BaseIssue = BaseIssue>(e: ErrorsOr<T, E>): Errors<E> {
    if (isValue(e)) {
        throw new ErrorsException(
            [{ message: `Expected errors but got value ${safeJson(e)}` } as E],
            e.warnings,
        );
    }
    return e;
}

/**
 * Convert an unknown thrown exception into a structured Errors result.
 * Use at unsafe external boundaries, not for ordinary domain validation.
 */
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

/**
 * Map over a successful value while preserving warnings.
 * Errors pass through unchanged.
 */
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

/**
 * Monadic bind for ErrorsOr.
 * Short-circuits on errors, and appends warnings from both steps.
 */
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

/**
 * Async map over a successful value while preserving warnings.
 * Errors pass through without invoking the async function.
 */
export function mapErrorsOrK<T, T1, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (t: T) => Promise<T1>,
): Promise<ErrorsOr<T1, E>> {
    if (isErrors(e)) return Promise.resolve(e as ErrorsOr<T1, E>);
    return f(e.value).then((v) =>
        e.warnings && e.warnings.length > 0 ? { value: v, warnings: e.warnings } : { value: v },
    );
}

/**
 * Async monadic bind for ErrorsOr.
 * Short-circuits on existing errors, and appends warnings from both steps.
 */
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

/**
 * Collapse ErrorsOr to a plain value by handling errors explicitly.
 * Use sparingly; this intentionally discards warnings on success.
 */
export function recover<T, E extends BaseIssue = BaseIssue>(
    e: ErrorsOr<T, E>,
    f: (e: Errors<E>) => T,
): T {
    if (isErrors(e)) return f(e);
    return e.value;
}

/**
 * Standard async function shape for one-input operations that return ErrorsOr.
 * Useful for ports, adapters, and Kleisli-style composition.
 */
export type AsyncErrorCall<From, To, E extends BaseIssue = BaseIssue> = (
    from: From,
) => Promise<ErrorsOr<To, E>>;

/**
 * Standard async function shape for two-input operations that return ErrorsOr.
 * Useful when avoiding tuple noise in injected functions.
 */
export type AsyncErrorCall2<From1, From2, To, E extends BaseIssue = BaseIssue> = (
    from1: From1,
    from2: From2,
) => Promise<ErrorsOr<To, E>>;

/**
 * Applicative sequencing for arrays of ErrorsOr.
 * Does not short-circuit: collects all errors and all warnings from every item.
 */
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

/**
 * Async applicative sequencing for arrays of promised ErrorsOr.
 * Runs promises concurrently, then collects all errors and warnings.
 */
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

/**
 * Map an array with an ErrorsOr-returning function, collecting all results.
 * Does not short-circuit; use flatMap when sequencing dependent operations.
 */
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

/**
 * Async traverse for arrays with an ErrorsOr-returning async function.
 * Runs all mapped promises concurrently and accumulates all errors/warnings.
 */
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

/**
 * Traverse a two-dimensional array with an ErrorsOr-returning function.
 * Preserves the nested array shape while accumulating errors/warnings.
 */
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

/**
 * Turn a record of ErrorsOr values into an ErrorsOr record of plain values.
 * Accumulates errors/warnings across all entries without short-circuiting.
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

/**
 * Partition a record of ErrorsOr into successful values, errors, and warnings.
 * Useful when callers want partial successes rather than a single ErrorsOr.
 */
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

/**
 * Internal warning combiner.
 * Returns undefined instead of an empty array to keep serialized results compact.
 */
function append<E>(...items: (E[] | undefined)[]): E[] | undefined {
    const result: E[] = [];
    for (const item of items) {
        if (item && item.length > 0) result.push(...item);
    }
    return result.length > 0 ? result : undefined;
}

/**
 * flatMap for operations whose issue types differ.
 * Widens both issue domains back to BaseIssue at module boundaries.
 */
export function flatMapBaseIssue<G, H, E1 extends BaseIssue, E2 extends BaseIssue>(
    inp: ErrorsOr<G, E1>,
    fn: (g: G) => ErrorsOr<H, E2>,
): ErrorsOr<H, BaseIssue> {
    return flatMapErrorsOr(
        inp as ErrorsOr<G, BaseIssue>,
        (g) => fn(g) as ErrorsOr<H, BaseIssue>,
    );
}

/**
 * Async flatMap for operations whose issue types differ.
 * Widens both issue domains back to BaseIssue at module boundaries.
 */
export async function flatMapBaseIssueK<G, H, E1 extends BaseIssue, E2 extends BaseIssue>(
    inp: ErrorsOr<G, E1>,
    fn: (g: G) => Promise<ErrorsOr<H, E2>>,
): Promise<ErrorsOr<H, BaseIssue>> {
    return flatMapErrorsOrK(inp, (g) => fn(g) as Promise<ErrorsOr<H, BaseIssue>>);
}

/**
 * map for operations whose issue type should be widened to BaseIssue.
 * Useful when exposing module-specific results through a common API.
 */
export function mapBaseIssue<G, H, E extends BaseIssue>(
    inp: ErrorsOr<G, E>,
    fn: (g: G) => H,
): ErrorsOr<H, BaseIssue> {
    return mapErrorsOr(
        inp as ErrorsOr<G, BaseIssue>,
        fn,
    );
}

/**
 * Async map for operations whose issue type should be widened to BaseIssue.
 * Useful when exposing module-specific results through a common API.
 */
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

/**
 * Run a main operation and then always run cleanup, combining both ErrorsOr results.
 * Keeps the main value if both succeed; accumulates errors and warnings from both.
 */
export async function withCleanupErrorsOr<T, E extends BaseIssue = BaseIssue>(
    main: () => Promise<ErrorsOr<T, E>>,
    cleanup: () => Promise<ErrorsOr<unknown, E>>,
): Promise<ErrorsOr<T, E>> {
    const mainResult = await main();
    const cleanupResult = await cleanup();

    const allWarnings = [
        ...warnings(mainResult),
        ...warnings(cleanupResult),
    ];

    if (isErrors(mainResult) || isErrors(cleanupResult)) {
        const allErrors = [
            ...(isErrors(mainResult) ? mainResult.errors : []),
            ...(isErrors(cleanupResult) ? cleanupResult.errors : []),
        ];

        const [first, ...rest] = allErrors;

        return errors(
            first,
            rest,
            allWarnings.length > 0 ? allWarnings : undefined,
            isErrors(mainResult)
                ? mainResult.reference
                : isErrors(cleanupResult)
                    ? cleanupResult.reference
                    : undefined,
        );
    }

    return value(
        mainResult.value,
        allWarnings.length > 0 ? allWarnings : undefined,
    );
}
export function addDiagnosticContextToIssue<Inp extends BaseIssue>(
    issue: Inp,
    diagnosticContext: DiagnosticContext,
): Inp & FileIssue {
    return {
        ...issue,
        diagnosticContext,
    }
}

export function addDiagnosticContextToErrors<T, E extends BaseIssue>(
    result: ErrorsOr<T, E>,
    diagnosticContext: DiagnosticContext,
): ErrorsOr<T, (E & FileIssue) | FileIssue> {
    const mappedWarnings = (result.warnings ?? [])
        .map(w => addDiagnosticContextToIssue(w, diagnosticContext))

    if (!isErrors(result)) {
        return value(result.value, mappedWarnings)
    }

    if (result.errors.length === 0) {
        return errors<FileIssue>({
            kind: "loaderErrorWithoutIssue",
            message: "Loader failed without any error issues",
            diagnosticContext,
        })
    }

    const [firstError, ...restErrors] = result.errors

    return errors(
        addDiagnosticContextToIssue(firstError, diagnosticContext),
        restErrors.map(e => addDiagnosticContextToIssue(e, diagnosticContext)),
        mappedWarnings,
        result.reference,
    )
}