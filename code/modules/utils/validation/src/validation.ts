import {NameAnd} from "@laoban/records";
import {safeJson} from "@laoban/safe";
import {BaseIssue, Errors, errors, ErrorsOr, isErrors, value, warnings} from "@laoban/errors";
import {Observability} from "@laoban/observability";

export type LiteralValue = string | number | boolean | null;

export type ValidatorDebugContext =
    | "validation"
    | "validation:shape"
    | "validation:field"
    | "validation:union";

export type ValidationContext = string[];

export type ValidationIssue = BaseIssue<"validation", ValidationContext> & {
    kind: "validation";
};

export type Validator<T, DebugContext extends string = ValidatorDebugContext> = (
    context: ValidationContext,
    observability: Observability<DebugContext>
) => (t: T) => ErrorsOr<T, ValidationIssue>;

export function validationError(
    context: ValidationContext,
    message: string,
    extras?: Partial<ValidationIssue>
): ValidationIssue {
    return {
        kind: "validation",
        severity: "error",
        context,
        message,
        ...extras,
    };
}

export function validationWarning(
    context: ValidationContext,
    message: string,
    extras?: Partial<ValidationIssue>
): ValidationIssue {
    return {
        kind: "validation",
        severity: "warning",
        context,
        message,
        ...extras,
    };
}

export function renderContext(context: ValidationContext): string {
    if (context.length === 0) return "<root>";
    return context.join(".");
}

export function validationErrors(
    first: ValidationIssue,
    rest?: ValidationIssue[],
    warningList?: ValidationIssue[],
    reference?: string
): Errors<ValidationIssue> {
    return errors(first, rest, warningList, reference);
}

export function oneValidationError(
    context: ValidationContext,
    message: string,
    extras?: Partial<ValidationIssue>,
    warningList?: ValidationIssue[],
    reference?: string
): Errors<ValidationIssue> {
    return validationErrors(
        validationError(context, message, extras),
        undefined,
        warningList,
        reference
    );
}

export function debugValidation<DebugContext extends string>(
    observability: Observability<DebugContext>,
    area: DebugContext,
    context: ValidationContext,
    message: string,
    input: unknown
): void {
    observability.debug(
        area,
        "debug",
        `Validator ${renderContext(context)} ${message}`,
        safeJson(input)
    );
}

export function flattenValidationResults<T>(
    results: ErrorsOr<T, ValidationIssue>[]
): ErrorsOr<T[], ValidationIssue> {
    const values: T[] = [];
    const errs: ValidationIssue[] = [];
    const warns: ValidationIssue[] = [];

    for (const result of results) {
        warns.push(...(warnings(result) ?? []));
        if (isErrors(result)) errs.push(...result.errors);
        else values.push(result.value);
    }

    if (errs.length > 0) {
        return validationErrors(errs[0], errs.slice(1), warns);
    }
    return value(values, warns);
}

type UnwrapValidator<V> = V extends Validator<infer U, any> ? U : never;

export function combineValidators<T, DebugContext extends string = ValidatorDebugContext>(
    ...validators: Validator<T, DebugContext>[]
): Validator<T, DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(observability, "validation" as DebugContext, context, "combine validators", input);

        const combined = flattenValidationResults(
            validators.map(v => v(context, observability)(input))
        );

        return isErrors(combined) ? combined : value(input, combined.warnings);
    };
}
export function chainValidators<T, D extends string = ValidatorDebugContext>(
    ...validators: Validator<T, D>[]
): Validator<T, D> {
    return (context: ValidationContext, observability) => (input: T): ErrorsOr<T, ValidationIssue> => {
        let warningList: ValidationIssue[] = [];

        for (const validator of validators) {
            const result = validator(context, observability)(input);

            if (result.warnings) warningList = [...warningList, ...result.warnings];
            if (isErrors(result)) return validationErrors(result.errors[0], result.errors.slice(1), warningList);
        }

        return value(input, warningList);
    };
}
export function composeOr<
    V extends Record<string, Validator<any, DebugContext>>,
    DebugContext extends string = ValidatorDebugContext
>(
    validators: V
): Validator<UnwrapValidator<V[keyof V]>, DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: UnwrapValidator<V[keyof V]>): ErrorsOr<UnwrapValidator<V[keyof V]>, ValidationIssue> => {
        const reasons: ValidationIssue[] = [];
        const warns: ValidationIssue[] = [];

        debugValidation(observability, "validation:union" as DebugContext, context, "compose or", input);

        for (const key in validators) {
            const validator = validators[key] as Validator<UnwrapValidator<V[keyof V]>, DebugContext>;
            const result = validator(context, observability)(input as any);

            warns.push(...(warnings(result) ?? []));

            if (!isErrors(result)) return value(input, warns);

            reasons.push(validationError(context, `${renderContext(context)} is not a ${key}`, {code: "not.type"}));
            reasons.push(...result.errors);
        }

        return validationErrors(reasons[0], reasons.slice(1), warns);
    };
}

export function composeTypedOr<
    V extends Record<string, Validator<any, DebugContext>>,
    T extends UnwrapValidator<V[keyof V]>,
    DebugContext extends string = ValidatorDebugContext
>(
    typeFn: (t: T) => keyof V,
    validators: V
): Validator<T, DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T): ErrorsOr<T, ValidationIssue> => {
        let type: keyof V | undefined;
        try {
            type = typeFn(input);
        } catch {
            type = undefined;
        }

        debugValidation(
            observability,
            "validation:union" as DebugContext,
            context,
            `compose typed or ${type?.toString()}`,
            input
        );

        if (!type) {
            return oneValidationError(
                context,
                `${renderContext(context)} has no valid type`,
                {code: "missing.type"}
            );
        }

        const validator = validators[type];
        if (!validator) {
            return oneValidationError(
                context,
                `${renderContext(context)} has illegal type ${String(type)}. Legal values are: ${Object.keys(validators).sort().join(", ")}`,
                {code: "illegal.type"}
            );
        }

        return validator(context, observability)(input as any);
    };
}

export function mustBeType<T, DebugContext extends string = ValidatorDebugContext>(
    typeCheck: (v: unknown) => v is T,
    typeName: string
): Validator<T, DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(observability, "validation" as DebugContext, context, `must be type ${typeName}`, input);

        if (input === undefined) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was undefined`,
                {code: "required"}
            );
        }

        if (input === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was null`,
                {code: "required"}
            );
        }

        return typeCheck(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be a ${typeName}`,
                {code: "wrong.type"}
            );
    };
}

export const ifPresent = <T>(
    validator: Validator<T>
): Validator<T | undefined > =>
    (context: ValidationContext, observability) =>
        (input: T | undefined ): ErrorsOr<T | undefined , ValidationIssue> =>
        input === undefined || input === null
            ? value(input)
            : validator(context, observability)(input);

export function mustBeTypeIfPresent<T, DebugContext extends string = ValidatorDebugContext>(
    typeCheck: (v: unknown) => v is T,
    typeName: string
): Validator<T | undefined, DebugContext> {
    const required = mustBeType<T, DebugContext>(typeCheck, typeName);

    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T | undefined): ErrorsOr<T | undefined, ValidationIssue> => {
        debugValidation(observability, "validation" as DebugContext, context, `must be type ${typeName} if present`, input);

        if (input === undefined || input === null) return value(input);

        const result = required(context, observability)(input);
        return isErrors(result) ? result : value(input, result.warnings);
    };
}

export const mustBeString: Validator<string> =
    mustBeType((v): v is string => typeof v === "string", "string");

export const mustBeNumber: Validator<number> =
    mustBeType((v): v is number => typeof v === "number", "number");

export const mustBeBoolean: Validator<boolean> =
    mustBeType((v): v is boolean => typeof v === "boolean", "boolean");

export const mustBeStringIfPresent: Validator<string | undefined> =
    mustBeTypeIfPresent((v): v is string => typeof v === "string", "string");

export const mustBeNumberIfPresent: Validator<number | undefined> =
    mustBeTypeIfPresent((v): v is number => typeof v === "number", "number");

export const mustBeBooleanIfPresent: Validator<boolean | undefined> =
    mustBeTypeIfPresent((v): v is boolean => typeof v === "boolean", "boolean");

export function mustBeLiteral<T extends LiteralValue, DebugContext extends string = ValidatorDebugContext>(
    expected: T
): Validator<T, DebugContext> {
    const typeName = expected === null ? "null" : typeof expected;

    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(
            observability,
            "validation" as DebugContext,
            context,
            `must be literal ${safeJson(expected)}`,
            input
        );

        if (input === undefined) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was undefined`,
                {code: "required"}
            );
        }

        if (input === null) {
            return expected === null
                ? value(input)
                : oneValidationError(
                    context,
                    `${renderContext(context)} must be ${safeJson(expected)} but was null`,
                    {code: "wrong.literal"}
                );
        }

        if (expected === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be null but was ${safeJson(input)}`,
                {code: "wrong.literal"}
            );
        }

        if (typeof input !== typeof expected) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be a ${typeName}`,
                {code: "wrong.type"}
            );
        }

        return Object.is(input, expected)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be ${safeJson(expected)} but was ${safeJson(input)}`,
                {code: "wrong.literal"}
            );
    };
}

export function mustBeArrayOf<T, DebugContext extends string = ValidatorDebugContext>(
    itemValidator: Validator<T, DebugContext>
): Validator<T[], DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T[]): ErrorsOr<T[], ValidationIssue> => {
        debugValidation(observability, "validation:shape" as DebugContext, context, "must be array of", input);

        if (!Array.isArray(input)) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be an array`,
                {code: "wrong.type"}
            );
        }

        const itemResults = input.map((item, idx) =>
            itemValidator([...context, String(idx)], observability)(item)
        );

        const flattened = flattenValidationResults(itemResults);
        return isErrors(flattened) ? flattened : value(input, flattened.warnings);
    };
}

export function mustBeArrayOfIfPresent<T, DebugContext extends string = ValidatorDebugContext>(
    itemValidator: Validator<T, DebugContext>
): Validator<T[] | undefined, DebugContext> {
    const required = mustBeArrayOf(itemValidator);

    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T[] | undefined): ErrorsOr<T[] | undefined, ValidationIssue> => {
        debugValidation(observability, "validation:shape" as DebugContext, context, "must be array of if present", input);

        if (input === undefined || input === null) return value(input);

        const result = required(context, observability)(input);
        return isErrors(result) ? result : value(input, result.warnings);
    };
}

export function mustBeObjectWithFields<
    T extends Record<string, any>,
    DebugContext extends string = ValidatorDebugContext
>(
    fields: { [K in keyof T]: Validator<T[K], DebugContext> },
    required?: boolean
): Validator<T, DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(
            observability,
            "validation:shape" as DebugContext,
            context,
            `must be object with fields. Required ${required}`,
            input
        );

        if (!required && (input === undefined || input === null)) return value(input);

        if (typeof input !== "object" || input === null || Array.isArray(input)) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be an object`,
                {code: "wrong.type"}
            );
        }

        const obj = input as { [K in keyof T]: unknown };

        const results = (Object.keys(fields) as (keyof T)[]).map(key =>
            fields[key]([...context, String(key)], observability)(obj[key] as T[typeof key])
        );

        const flattened = flattenValidationResults(results);
        return isErrors(flattened) ? flattened : value(input, flattened.warnings);
    };
}

export function mustBeNameAnd<T, DebugContext extends string = ValidatorDebugContext>(
    validator: Validator<T, DebugContext>,
    required?: boolean
): Validator<NameAnd<T>, DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: NameAnd<T>): ErrorsOr<NameAnd<T>, ValidationIssue> => {
        debugValidation(observability, "validation:field" as DebugContext, context, "must be NameAnd", input);

        if (!required && !input) return value(input);

        if (typeof input !== "object" || input === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be an object`,
                {code: "wrong.type"}
            );
        }

        if (Array.isArray(input)) {
            return oneValidationError(
                context,
                `${renderContext(context)} must be a NameAnd object, not an array`,
                {code: "wrong.type"}
            );
        }

        const topLevelErrors: ValidationIssue[] = [];
        const results: ErrorsOr<T, ValidationIssue>[] = [];

        for (const [key, val] of Object.entries(input)) {
            if (typeof key !== "string" || key.trim() === "") {
                topLevelErrors.push(
                    validationError(
                        context,
                        `${renderContext(context)} has invalid key: ${key}`,
                        {code: "invalid.key"}
                    )
                );
                continue;
            }
            results.push(validator([...context, key], observability)(val));
        }

        const flattened = flattenValidationResults(results);

        if (isErrors(flattened)) {
            const allErrors = [...topLevelErrors, ...flattened.errors];
            return validationErrors(allErrors[0], allErrors.slice(1), flattened.warnings);
        }

        if (topLevelErrors.length > 0) {
            return validationErrors(topLevelErrors[0], topLevelErrors.slice(1), flattened.warnings);
        }

        return value(input, flattened.warnings);
    };
}

export function mustBeNameAndIfPresent<T, DebugContext extends string = ValidatorDebugContext>(
    validator: Validator<T, DebugContext>
): Validator<NameAnd<T> | undefined, DebugContext> {
    const required = mustBeNameAnd(validator, true);

    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: NameAnd<T> | undefined): ErrorsOr<NameAnd<T> | undefined, ValidationIssue> => {
        debugValidation(observability, "validation:field" as DebugContext, context, "must be NameAnd if present", input);

        if (input === undefined || input === null) return value(input);

        const result = required(context, observability)(input);
        return isErrors(result) ? result : value(input, result.warnings);
    };
}

export const minLength = (n: number): Validator<string> =>
    (context: ValidationContext) => (input: string): ErrorsOr<string, ValidationIssue> =>
        input.length >= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have length >= ${n}`,
                {code: "min.length"}
            );

export const maxLength = (n: number): Validator<string> =>
    (context: ValidationContext) => (input: string): ErrorsOr<string, ValidationIssue> =>
        input.length <= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have length <= ${n}`,
                {code: "max.length"}
            );
export const exactLength = (n: number): Validator<string> =>
    (context: ValidationContext) => (input: string): ErrorsOr<string, ValidationIssue> =>
        input.length === n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have length = ${n}`,
                {code: "exact.length"}
            );
export const pattern = (re: RegExp, name?: string): Validator<string> =>
    (context: ValidationContext) => (input: string): ErrorsOr<string, ValidationIssue> =>
        re.test(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must match pattern ${name ?? re.toString()}`,
                {code: "pattern"}
            );
export const nonBlank: Validator<string> =
    (context: ValidationContext) => (input: string): ErrorsOr<string, ValidationIssue> =>
        input.trim().length > 0
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must not be blank`,
                {code: "blank"}
            );
export const format = (fmt: string): Validator<string> => {
    switch (fmt) {
        case "uuid": {
            const uuidRe =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            return pattern(uuidRe, "uuid");
        }
        default:
            return (_context: ValidationContext) => (input: string) => value(input);
    }
};

export const min = (n: number): Validator<number> =>
    (context: ValidationContext) => (input: number): ErrorsOr<number, ValidationIssue> =>
        input >= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be >= ${n}`,
                {code: "min"}
            );

export const max = (n: number): Validator<number> =>
    (context: ValidationContext) => (input: number): ErrorsOr<number, ValidationIssue> =>
        input <= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be <= ${n}`,
                {code: "max"}
            );

export const integer = (): Validator<number> =>
    (context: ValidationContext) => (input: number): ErrorsOr<number, ValidationIssue> =>
        Number.isInteger(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be an integer`,
                {code: "integer"}
            );


export const minItems = (n: number): Validator<unknown[]> =>
    (context: ValidationContext) => (input: unknown[]): ErrorsOr<unknown[], ValidationIssue> =>
        input.length >= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have at least ${n} items`,
                {code: "min.items"}
            );

export const maxItems = (n: number): Validator<unknown[]> =>
    (context: ValidationContext) => (input: unknown[]): ErrorsOr<unknown[], ValidationIssue> =>
        input.length <= n
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must have at most ${n} items`,
                {code: "max.items"}
            );

export const when = <T, DebugContext extends string = ValidatorDebugContext>(
    cond: boolean,
    validator: Validator<T, DebugContext>
): Validator<T, DebugContext> =>
    (context, observability) => (input) =>
        cond ? validator(context, observability)(input) : value(input);

export function mustBeEnum<T extends string, DebugContext extends string = ValidatorDebugContext>(
    values: readonly T[]
): Validator<T, DebugContext> {
    const allowed = new Set<string>(values);

    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T): ErrorsOr<T, ValidationIssue> => {
        debugValidation(
            observability,
            "validation" as DebugContext,
            context,
            `must be enum ${values.join(", ")}`,
            input
        );

        if (input === undefined) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was undefined`,
                {code: "required"}
            );
        }

        if (input === null) {
            return oneValidationError(
                context,
                `${renderContext(context)} is required but was null`,
                {code: "required"}
            );
        }

        if (typeof input !== "string") {
            return oneValidationError(
                context,
                `${renderContext(context)} must be a string`,
                {code: "wrong.type"}
            );
        }

        return allowed.has(input)
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be one of ${values.map(safeJson).join(", ")} but was ${safeJson(input)}`,
                {code: "enum"}
            );
    };
}

export function nullableValidator<T, DebugContext extends string = ValidatorDebugContext>(
    validator: Validator<T, DebugContext>
): Validator<T | null | undefined, DebugContext> {
    return (context: ValidationContext, observability: Observability<DebugContext>) => (input: T | null | undefined): ErrorsOr<T | null | undefined, ValidationIssue> => {
        debugValidation(observability, "validation" as DebugContext, context, "nullable if present", input);

        if (input === null || input === undefined) return value(input);

        const result = validator(context, observability)(input);
        return isErrors(result) ? result : value(input, result.warnings);
    };
}

export function deprecatedField<DebugContext extends string = ValidatorDebugContext>(
    message: string
): Validator<unknown, DebugContext> {
    return (context: ValidationContext) => (input: unknown): ErrorsOr<unknown, ValidationIssue> =>
        value(input, [
            validationWarning(context, message, {code: "deprecated"})
        ]);
}