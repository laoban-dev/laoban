import {NameAnd} from "@laoban/records"
import {safeJson} from "@laoban/safe"
import {
    BaseIssue,
    CommonIssue,
    DiagnosticContext,
    Errors,
    errors,
    ErrorsOr,
    fileIssue,
    isErrors,
    value,
    warnings,
} from "@laoban/errors"
import {DebugName, Observability} from "@laoban/observability"

export type LiteralValue = string | number | boolean | null

/**
 * The normal validation path inside the value being validated.
 *
 * This is the old ValidationContext shape and remains the default.
 * Existing callers using string[] continue to work unchanged.
 */
export type ValidationPath = string[]

export type ValidationContext = ValidationPath

/**
 * Optional richer context for file-backed validation.
 *
 * The validator still stores `path` as the issue context.
 * The file information is placed in `diagnosticContext`.
 */
export type FileValidationContext = {
    diagnosticContext: DiagnosticContext
    path: ValidationPath
}

export type AnyValidationContext =
    | ValidationContext
    | FileValidationContext

export type ValidationIssue<Context = ValidationContext> = BaseIssue<"validation", Context> & {
    kind: "validation"
}

/**
 * Existing usage remains:
 *
 *   Validator<T>
 *
 * The optional Context parameter only exists for callers that want file-backed
 * validation contexts.
 */
export type Validator<
    T,
    Context extends AnyValidationContext = AnyValidationContext
> = (
    context: Context,
    observability: Observability
) => (t: T) => ErrorsOr<T, ValidationIssue<ValidationContext>>

export function fileValidationContext(
    currentFile: string,
    path: ValidationPath = [],
    loadPath?: string[],
): FileValidationContext {
    return {
        diagnosticContext: {
            currentFile,
            ...(loadPath === undefined ? {} : {loadPath}),
        },
        path,
    }
}

export function isFileValidationContext(
    context: AnyValidationContext,
): context is FileValidationContext {
    return !Array.isArray(context) &&
        typeof context === "object" &&
        context !== null &&
        Array.isArray((context as FileValidationContext).path) &&
        typeof (context as FileValidationContext).diagnosticContext?.currentFile === "string"
}

export function validationPath(
    context: AnyValidationContext,
): ValidationPath {
    return isFileValidationContext(context)
        ? context.path
        : context
}

export function childValidationContext<Context extends AnyValidationContext>(
    context: Context,
    child: string,
): Context {
    return (
        isFileValidationContext(context)
            ? {
                ...context,
                path: [...context.path, child],
            }
            : [...validationPath(context), child]
    ) as Context
}

function validationFileIssue(
    context: FileValidationContext,
    issue: CommonIssue<"validation", ValidationPath>,
): ValidationIssue<ValidationContext> {
    return {
        ...fileIssue(
            context.diagnosticContext.currentFile,
            issue,
            context.diagnosticContext.loadPath,
        ),
        kind: "validation",
    }
}

export function validationError<Context extends AnyValidationContext = AnyValidationContext>(
    context: Context,
    message: string,
    extras?: Partial<ValidationIssue<ValidationContext>>,
): ValidationIssue<ValidationContext> {
    const issue: CommonIssue<"validation", ValidationContext> = {
        kind: "validation",
        severity: "error",
        context: validationPath(context),
        message,
        ...extras,
    }

    return isFileValidationContext(context)
        ? validationFileIssue(context, issue)
        : issue as ValidationIssue<ValidationContext>
}

export function validationWarning<Context extends AnyValidationContext = AnyValidationContext>(
    context: Context,
    message: string,
    extras?: Partial<ValidationIssue<ValidationContext>>,
): ValidationIssue<ValidationContext> {
    const issue: CommonIssue<"validation", ValidationContext> = {
        kind: "validation",
        severity: "warning",
        context: validationPath(context),
        message,
        ...extras,
    }

    return isFileValidationContext(context)
        ? validationFileIssue(context, issue)
        : issue as ValidationIssue<ValidationContext>
}

export function renderContext(context: AnyValidationContext): string {
    const path = validationPath(context)
    if (path.length === 0) return "<root>"
    return path.join(".")
}

export function validationErrors(
    first: ValidationIssue,
    rest?: ValidationIssue[],
    warningList?: ValidationIssue[],
    reference?: string
): Errors<ValidationIssue> {
    return errors(first, rest, warningList, reference)
}

export function oneValidationError<Context extends AnyValidationContext = AnyValidationContext>(
    context: Context,
    message: string,
    extras?: Partial<ValidationIssue>,
    warningList?: ValidationIssue[],
    reference?: string
): Errors<ValidationIssue> {
    return validationErrors(
        validationError(context, message, extras),
        undefined,
        warningList,
        reference,
    )
}

export function debugValidation(
    observability: Observability,
    area: DebugName,
    context: AnyValidationContext,
    message: string,
    input: unknown,
): void {
    observability.debug(
        area,
        "debug",
        `Validator ${renderContext(context)} ${message}`,
        safeJson(input),
    )
}

export function flattenValidationResults<T>(
    results: ErrorsOr<T, ValidationIssue>[]
): ErrorsOr<T[], ValidationIssue> {
    const values: T[] = []
    const errs: ValidationIssue[] = []
    const warns: ValidationIssue[] = []

    for (const result of results) {
        warns.push(...(warnings(result) ?? []))
        if (isErrors(result)) errs.push(...result.errors)
        else values.push(result.value)
    }

    if (errs.length > 0) {
        return validationErrors(errs[0], errs.slice(1), warns)
    }

    return value(values, warns)
}

type UnwrapValidator<V> = V extends Validator<infer U, any> ? U : never

export function combineValidators<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    ...validators: Validator<T, Context>[]
): Validator<T, Context> {
    return (context: Context, observability: Observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(observability, ["validation"], context, "combine validators", input)

        const combined = flattenValidationResults(
            validators.map(v => v(context, observability)(input)),
        )

        return isErrors(combined) ? combined : value(input, combined.warnings)
    }
}

export function chainValidators<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    ...validators: Validator<T, Context>[]
): Validator<T, Context> {
    return (context: Context, observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        let warningList: ValidationIssue[] = []

        for (const validator of validators) {
            const result = validator(context, observability)(input)

            if (result.warnings) warningList = [...warningList, ...result.warnings]
            if (isErrors(result)) return validationErrors(result.errors[0], result.errors.slice(1), warningList)
        }

        return value(input, warningList)
    }
}

export function composeOr<
    V extends Record<string, Validator<any, Context>>,
    Context extends AnyValidationContext = AnyValidationContext
>(
    validators: V
): Validator<UnwrapValidator<V[keyof V]>, Context> {
    return (context: Context, observability: Observability) => (input: UnwrapValidator<V[keyof V]>): ErrorsOr<UnwrapValidator<V[keyof V]>, ValidationIssue> => {
        const reasons: ValidationIssue[] = []
        const warns: ValidationIssue[] = []

        debugValidation(observability, ["validation", "union"], context, "compose or", input)

        for (const key in validators) {
            const validator = validators[key] as Validator<UnwrapValidator<V[keyof V]>, Context>
            const result = validator(context, observability)(input as any)

            warns.push(...(warnings(result) ?? []))

            if (!isErrors(result)) return value(input, warns)

            reasons.push(validationError(context, `${renderContext(context)} is not a ${key}`, {code: "not.type"}))
            reasons.push(...result.errors)
        }

        return validationErrors(reasons[0], reasons.slice(1), warns)
    }
}

export function composeTypedOr<
    V extends Record<string, Validator<any, Context>>,
    T extends UnwrapValidator<V[keyof V]>,
    Context extends AnyValidationContext = AnyValidationContext
>(
    typeFn: (t: T) => keyof V,
    validators: V
): Validator<T, Context> {
    return (context: Context, observability: Observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        let type: keyof V | undefined

        try {
            type = typeFn(input)
        } catch {
            type = undefined
        }

        debugValidation(
            observability,
            ["validation", "union"],
            context,
            `compose typed or ${type?.toString()}`,
            input,
        )

        if (!type) {
            return oneValidationError(
                context,
                `${renderContext(context)} has no valid type`,
                {code: "missing.type"},
            )
        }

        const validator = validators[type]
        if (!validator) {
            return oneValidationError(
                context,
                `${renderContext(context)} has illegal type ${String(type)}. Legal values are: ${Object.keys(validators).sort().join(", ")}`,
                {code: "illegal.type"},
            )
        }

        return validator(context, observability)(input as any)
    }
}

export function mustBeBooleanStringOrObject<
    T,
    Context extends AnyValidationContext = ValidationContext
>(
    objectValidator: Validator<T, Context>,
): Validator<boolean | string | T, Context> {
    return (context: Context, observability: Observability) =>
        (input: boolean | string | T): ErrorsOr<boolean | string | T, ValidationIssue> => {
            debugValidation(
                observability,
                ["validation", "union"],
                context,
                "must be boolean, string or object",
                input,
            )

            if (typeof input === "boolean") return value(input)
            if (typeof input === "string") return value(input)

            if (typeof input === "object" && input !== null && !Array.isArray(input)) {
                return objectValidator(context, observability)(input as T)
            }

            return oneValidationError(
                context,
                `${renderContext(context)} must be a boolean, string or object but was ${
                    input === null ? "null" :
                        Array.isArray(input) ? "array" :
                            typeof input
                }`,
                {code: "wrong.type"},
            )
        }
}

export function mustBeStringOrObject<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    objectValidator: Validator<T, Context>,
): Validator<string | T, Context> {
    return (context: Context, observability: Observability) => (input: string | T): ErrorsOr<string | T, ValidationIssue> => {
        debugValidation(
            observability,
            ["validation", "union"],
            context,
            "must be string or object",
            input,
        )

        if (typeof input === "string") return value(input)

        if (typeof input === "object" && input !== null && !Array.isArray(input)) {
            return objectValidator(context, observability)(input as T)
        }

        return oneValidationError(
            context,
            `${renderContext(context)} must be a string or object but was ${
                input === null ? "null" :
                    Array.isArray(input) ? "array" :
                        typeof input
            }`,
            {code: "wrong.type"},
        )
    }
}

export function mustBeType<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    typeCheck: (v: unknown) => v is T,
    typeName: string
): Validator<T, Context> {
    return (context: Context, observability: Observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(observability, ["validation"], context, `must be type ${typeName}`, input)

        if (input === undefined) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was undefined`,
                {code: "required"},
            )
        }

        if (input === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was null`,
                {code: "required"},
            )
        }

        return typeCheck(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be a ${typeName} but was a ${typeof input}`,
                {code: "wrong.type"},
            )
    }
}

export const ifPresent = <
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    validator: Validator<T, Context>
): Validator<T | undefined, Context> =>
    (context: Context, observability) =>
        (input: T | undefined): ErrorsOr<T | undefined, ValidationIssue> =>
            input === undefined || input === null
                ? value(input)
                : validator(context, observability)(input)

export function mustBeTypeIfPresent<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    typeCheck: (v: unknown) => v is T,
    typeName: string
): Validator<T | undefined, Context> {
    const required = mustBeType<T, Context>(typeCheck, typeName)

    return (context: Context, observability: Observability) => (input: T | undefined): ErrorsOr<T | undefined, ValidationIssue> => {
        debugValidation(observability, ["validation"], context, `must be type ${typeName} if present`, input)

        if (input === undefined || input === null) return value(input)

        const result = required(context, observability)(input)
        return isErrors(result) ? result : value(input, result.warnings)
    }
}

export const mustBeString: Validator<string, AnyValidationContext> =
    mustBeType<string, AnyValidationContext>((v): v is string => typeof v === "string", "string")

export const mustBeNumber: Validator<number, AnyValidationContext> =
    mustBeType<number, AnyValidationContext>((v): v is number => typeof v === "number", "number")

export const mustBeBoolean: Validator<boolean, AnyValidationContext> =
    mustBeType<boolean, AnyValidationContext>((v): v is boolean => typeof v === "boolean", "boolean")

export const mustBeStringIfPresent: Validator<string | undefined, AnyValidationContext> =
    mustBeTypeIfPresent<string, AnyValidationContext>((v): v is string => typeof v === "string", "string")

export const mustBeNumberIfPresent: Validator<number | undefined, AnyValidationContext> =
    mustBeTypeIfPresent<number, AnyValidationContext>((v): v is number => typeof v === "number", "number")

export const mustBeBooleanIfPresent: Validator<boolean | undefined, AnyValidationContext> =
    mustBeTypeIfPresent<boolean, AnyValidationContext>((v): v is boolean => typeof v === "boolean", "boolean")

export function mustBeOneOf<
    const T extends readonly unknown[],
    Context extends AnyValidationContext = AnyValidationContext
>(...values: T): Validator<T[number], Context> {
    return (context, _observability) => (input) => {
        if (input === undefined) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was undefined`,
                {code: "required"},
            )
        }

        if (input === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was null`,
                {code: "required"},
            )
        }

        if (values.some(v => Object.is(v, input))) {
            return value(input as T[number])
        }

        const expected =
            values.length === 1
                ? safeJson(values[0])
                : `one of ${values.map(v => safeJson(v)).join(", ")}`

        return oneValidationError(
            context,
            `${renderContext(context)} must be ${expected} but was ${safeJson(input)}`,
            {code: "wrong.literal"},
        )
    }
}

export function mustBeLiteral<
    T extends LiteralValue,
    Context extends AnyValidationContext = AnyValidationContext
>(
    expected: T
): Validator<T, Context> {
    const typeName = expected === null ? "null" : typeof expected

    return (context: Context, observability: Observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(
            observability,
            ["validation"],
            context,
            `must be literal ${safeJson(expected)}`,
            input,
        )

        if (input === undefined) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was undefined`,
                {code: "required"},
            )
        }

        if (input === null) {
            return expected === null
                ? value(input)
                : oneValidationError(
                    context,
                    `${renderContext(context)} must be ${safeJson(expected)} but was null`,
                    {code: "wrong.literal"},
                )
        }

        if (expected === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be null but was ${safeJson(input)}`,
                {code: "wrong.literal"},
            )
        }

        if (typeof input !== typeof expected) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be a ${typeName}`,
                {code: "wrong.type"},
            )
        }

        return Object.is(input, expected)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be ${safeJson(expected)} but was ${safeJson(input)}`,
                {code: "wrong.literal"},
            )
    }
}

export function mustBeArrayOf<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    itemValidator: Validator<T, Context>
): Validator<T[], Context> {
    return (context: Context, observability: Observability) => (input: T[]): ErrorsOr<T[], ValidationIssue> => {
        debugValidation(observability, ["validation", "shape"], context, "must be array of", input)

        if (!Array.isArray(input)) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be an array`,
                {code: "wrong.type"},
            )
        }

        const itemResults = input.map((item, idx) =>
            itemValidator(childValidationContext(context, String(idx)), observability)(item),
        )

        const flattened = flattenValidationResults(itemResults)
        return isErrors(flattened) ? flattened : value(input, flattened.warnings)
    }
}

export function mustBeArrayOfIfPresent<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    itemValidator: Validator<T, Context>
): Validator<T[] | undefined, Context> {
    const required = mustBeArrayOf(itemValidator)

    return (context: Context, observability: Observability) => (input: T[] | undefined): ErrorsOr<T[] | undefined, ValidationIssue> => {
        debugValidation(observability, ["validation", "shape"], context, "must be array of if present", input)

        if (input === undefined || input === null) return value(input)

        const result = required(context, observability)(input)
        return isErrors(result) ? result : value(input, result.warnings)
    }
}

export function mustBeObjectWithFields<
    T extends Record<string, any>,
    Context extends AnyValidationContext = AnyValidationContext
>(
    fields: { [K in keyof T]: Validator<T[K], Context> },
    required?: boolean
): Validator<T, Context> {
    return (context: Context, observability: Observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(
            observability,
            ["validation", "shape"],
            context,
            `must be object with fields. Required ${required}`,
            input,
        )

        if (!required && (input === undefined || input === null)) return value(input)

        if (typeof input !== "object" || input === null || Array.isArray(input)) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be an object`,
                {code: "wrong.type"},
            )
        }

        const obj = input as { [K in keyof T]: unknown }

        const results = (Object.keys(fields) as (keyof T)[]).map(key =>
            fields[key](
                childValidationContext(context, String(key)),
                observability,
            )(obj[key] as T[typeof key]),
        )

        const flattened = flattenValidationResults(results)
        return isErrors(flattened) ? flattened : value(input, flattened.warnings)
    }
}

export function mustBeNameAnd<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    validator: Validator<T, Context>,
    required?: boolean
): Validator<NameAnd<T>, Context> {
    return (context: Context, observability: Observability) => (input: NameAnd<T>): ErrorsOr<NameAnd<T>, ValidationIssue> => {
        debugValidation(observability, ["validation", "field"], context, "must be NameAnd", input)

        if (input === undefined) {
            return required
                ? oneValidationError(
                    context,
                    `${renderContext(context)} is required but was undefined`,
                    {code: "required"},
                )
                : value(input)
        }

        if (input === null) {
            return required
                ? oneValidationError(
                    context,
                    `${renderContext(context)} is required but was null`,
                    {code: "required"},
                )
                : value(input)
        }

        if (typeof input !== "object") {
            return oneValidationError(
                context,
                `${renderContext(context)} must be an object`,
                {code: "wrong.type"},
            )
        }

        if (Array.isArray(input)) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be a NameAnd object, not an array`,
                {code: "wrong.type"},
            )
        }

        const topLevelErrors: ValidationIssue[] = []
        const results: ErrorsOr<T, ValidationIssue>[] = []

        for (const [key, val] of Object.entries(input)) {
            if (typeof key !== "string" || key.trim() === "") {
                topLevelErrors.push(
                    validationError(
                        context,
                        `${renderContext(context)} has invalid key: ${key}`,
                        {code: "invalid.key"},
                    ),
                )
                continue
            }

            results.push(validator(childValidationContext(context, key), observability)(val))
        }

        const flattened = flattenValidationResults(results)

        if (isErrors(flattened)) {
            const allErrors = [...topLevelErrors, ...flattened.errors]
            return validationErrors(allErrors[0], allErrors.slice(1), flattened.warnings)
        }

        if (topLevelErrors.length > 0) {
            return validationErrors(topLevelErrors[0], topLevelErrors.slice(1), flattened.warnings)
        }

        return value(input, flattened.warnings)
    }
}

export function mustBeNameAndIfPresent<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    validator: Validator<T, Context>
): Validator<NameAnd<T> | undefined, Context> {
    const required = mustBeNameAnd(validator, true)

    return (context: Context, observability: Observability) => (input: NameAnd<T> | undefined): ErrorsOr<NameAnd<T> | undefined, ValidationIssue> => {
        debugValidation(observability, ["validation", "field"], context, "must be NameAnd if present", input)

        if (input === undefined || input === null) return value(input)

        const result = required(context, observability)(input)
        return isErrors(result) ? result : value(input, result.warnings)
    }
}

export const minLength = <
    Context extends AnyValidationContext = AnyValidationContext
>(n: number): Validator<string, Context> =>
    (context: Context) => (input: string): ErrorsOr<string, ValidationIssue> =>
        input.length >= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have length >= ${n}`,
                {code: "min.length"},
            )

export const maxLength = <
    Context extends AnyValidationContext = AnyValidationContext
>(n: number): Validator<string, Context> =>
    (context: Context) => (input: string): ErrorsOr<string, ValidationIssue> =>
        input.length <= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have length <= ${n}`,
                {code: "max.length"},
            )

export const exactLength = <
    Context extends AnyValidationContext = AnyValidationContext
>(n: number): Validator<string, Context> =>
    (context: Context) => (input: string): ErrorsOr<string, ValidationIssue> =>
        input.length === n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have length = ${n}`,
                {code: "exact.length"},
            )

export const pattern = <
    Context extends AnyValidationContext = AnyValidationContext
>(re: RegExp, name?: string): Validator<string, Context> =>
    (context: Context) => (input: string): ErrorsOr<string, ValidationIssue> =>
        re.test(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must match pattern ${name ?? re.toString()}`,
                {code: "pattern"},
            )

export const nonBlank: Validator<string, AnyValidationContext> =
    context => input =>
        input.trim().length > 0
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must not be blank`,
                {code: "blank"},
            )

export const format = <
    Context extends AnyValidationContext = AnyValidationContext
>(fmt: string): Validator<string, Context> => {
    switch (fmt) {
        case "uuid": {
            const uuidRe =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
            return pattern(uuidRe, "uuid")
        }
        default:
            return (_context: Context) => (input: string) => value(input)
    }
}

export const min = <
    Context extends AnyValidationContext = AnyValidationContext
>(n: number): Validator<number, Context> =>
    (context: Context) => (input: number): ErrorsOr<number, ValidationIssue> =>
        input >= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be >= ${n}`,
                {code: "min"},
            )

export const max = <
    Context extends AnyValidationContext = AnyValidationContext
>(n: number): Validator<number, Context> =>
    (context: Context) => (input: number): ErrorsOr<number, ValidationIssue> =>
        input <= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be <= ${n}`,
                {code: "max"},
            )

export const integer = <
    Context extends AnyValidationContext = AnyValidationContext
>(): Validator<number, Context> =>
    (context: Context) => (input: number): ErrorsOr<number, ValidationIssue> =>
        Number.isInteger(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be an integer`,
                {code: "integer"},
            )

export const minItems = <
    Context extends AnyValidationContext = AnyValidationContext
>(n: number): Validator<unknown[], Context> =>
    (context: Context) => (input: unknown[]): ErrorsOr<unknown[], ValidationIssue> =>
        input.length >= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have at least ${n} items`,
                {code: "min.items"},
            )

export const maxItems = <
    Context extends AnyValidationContext = AnyValidationContext
>(n: number): Validator<unknown[], Context> =>
    (context: Context) => (input: unknown[]): ErrorsOr<unknown[], ValidationIssue> =>
        input.length <= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have at most ${n} items`,
                {code: "max.items"},
            )

export const when = <
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    cond: boolean,
    validator: Validator<T, Context>
): Validator<T, Context> =>
    (context, observability) => (input) =>
        cond ? validator(context, observability)(input) : value(input)

export function mustBeEnum<
    T extends string,
    Context extends AnyValidationContext = AnyValidationContext
>(
    values: readonly T[]
): Validator<T, Context> {
    const allowed = new Set<string>(values)

    return (context: Context, observability: Observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(
            observability,
            ["validation"],
            context,
            `must be enum ${values.join(", ")}`,
            input,
        )

        if (input === undefined) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was undefined`,
                {code: "required"},
            )
        }

        if (input === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was null`,
                {code: "required"},
            )
        }

        if (typeof input !== "string") {
            return oneValidationError(
                context,
                `${renderContext(context)} must be a string`,
                {code: "wrong.type"},
            )
        }

        return allowed.has(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be one of ${values.map(safeJson).join(", ")} but was ${safeJson(input)}`,
                {code: "enum"},
            )
    }
}

export function nullableValidator<
    T,
    Context extends AnyValidationContext = AnyValidationContext
>(
    validator: Validator<T, Context>
): Validator<T | null | undefined, Context> {
    return (context: Context, observability: Observability) => (input: T | null | undefined): ErrorsOr<T | null | undefined, ValidationIssue> => {
        debugValidation(observability, ["validation"], context, "nullable if present", input)

        if (input === null || input === undefined) return value(input)

        const result = validator(context, observability)(input)
        return isErrors(result) ? result : value(input, result.warnings)
    }
}

export function deprecatedField<
    T = unknown,
    Context extends AnyValidationContext = AnyValidationContext
>(
    message: string,
): Validator<T, Context> {
    return (context: Context) => (input: T): ErrorsOr<T, ValidationIssue> =>
        value(input, [
            validationWarning(context, message, {code: "deprecated"}),
        ])
}