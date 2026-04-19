import {NameAnd} from "@laoban/records";
import {
    combineValidators,
    composeTypedOr,
    maxLength,
    mustBeBooleanIfPresent,
    mustBeLiteral,
    mustBeNameAndIfPresent,
    mustBeObjectWithFields,
    mustBeString,
    mustBeStringIfPresent,
    nonBlank,
    oneValidationError,
    renderContext,
    validationErrors,
    type ValidationContext,
    type ValidationIssue,
    type Validator,
    type ValidatorDebugContext, chainValidators, exactLength, ifPresent,
} from "@laoban/validation";
import {ErrorsOr, value} from "@laoban/errors";
import {
    CliExecute,
    CliFieldBase,
    CliFieldDef,
    CliGroup,
    CliModel,
    CliOptionBooleanFieldDef,
    CliOptionNumberFieldDef,
    CliOptionStringFieldDef,
    CliOptionStringsFieldDef,
    CliPositionalNumberFieldDef,
    CliPositionalStringFieldDef,
    CliPositionalStringsFieldDef,
    CliRecord,
    SomeCliCommand,
    isCliOptionFieldDef,
    isCliPositionalFieldDef,
    isCliPositionalStringsFieldDef, CliPositionalFieldDef,
} from "./cli.dsl";

export type CliValidationDebugContext =
    | ValidatorDebugContext
    | "validation:cli";

export const mustBeFunction: Validator<(...args: any[]) => any, CliValidationDebugContext> =
    (context: ValidationContext) => (input: (...args: any[]) => any): ErrorsOr<(...args: any[]) => any, ValidationIssue> =>
        typeof input === "function"
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} must be a function`,
                {code: "wrong.type"}
            );

export const validateCliFieldBase: Validator<CliFieldBase, CliValidationDebugContext> =
    mustBeObjectWithFields<CliFieldBase, CliValidationDebugContext>({
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
    }, true);

export const validateCliPositionalStringFieldDef: Validator<CliPositionalStringFieldDef, CliValidationDebugContext> =
    mustBeObjectWithFields<CliPositionalStringFieldDef, CliValidationDebugContext>({
        kind: mustBeLiteral("positionalString"),
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
    }, true);

export const validateCliPositionalNumberFieldDef: Validator<CliPositionalNumberFieldDef, CliValidationDebugContext> =
    mustBeObjectWithFields<CliPositionalNumberFieldDef, CliValidationDebugContext>({
        kind: mustBeLiteral("positionalNumber"),
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
    }, true);

export const validateCliPositionalStringsFieldDef: Validator<CliPositionalStringsFieldDef, CliValidationDebugContext> =
    mustBeObjectWithFields<CliPositionalStringsFieldDef, CliValidationDebugContext>({
        kind: mustBeLiteral("positionalStrings"),
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
        variadic: mustBeBooleanIfPresent,
    }, true);

const shortNameValidator : Validator<string> = ifPresent(combineValidators(mustBeString, exactLength(1)))
export const validateCliOptionStringFieldDef: Validator<CliOptionStringFieldDef, CliValidationDebugContext> =
    mustBeObjectWithFields<CliOptionStringFieldDef, CliValidationDebugContext>({
        kind: mustBeLiteral("optionString"),
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
        shortName: shortNameValidator
    }, true);

export const validateCliOptionStringsFieldDef: Validator<CliOptionStringsFieldDef, CliValidationDebugContext> =
    mustBeObjectWithFields<CliOptionStringsFieldDef, CliValidationDebugContext>({
        kind: mustBeLiteral("optionStrings"),
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
        shortName: shortNameValidator
    }, true);

export const validateCliOptionBooleanFieldDef: Validator<CliOptionBooleanFieldDef, CliValidationDebugContext> =
    mustBeObjectWithFields<CliOptionBooleanFieldDef, CliValidationDebugContext>({
        kind: mustBeLiteral("optionBoolean"),
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
        shortName: shortNameValidator
    }, true);

export const validateCliOptionNumberFieldDef: Validator<CliOptionNumberFieldDef, CliValidationDebugContext> =
    mustBeObjectWithFields<CliOptionNumberFieldDef, CliValidationDebugContext>({
        kind: mustBeLiteral("optionNumber"),
        description: combineValidators(mustBeString, nonBlank),
        required: mustBeBooleanIfPresent,
        shortName: shortNameValidator
    }, true);

export const validateCliFieldDef: Validator<CliFieldDef, CliValidationDebugContext> =
    composeTypedOr<
        {
            positionalString: Validator<CliPositionalStringFieldDef, CliValidationDebugContext>;
            positionalStrings: Validator<CliPositionalStringsFieldDef, CliValidationDebugContext>;
            positionalNumber: Validator<CliPositionalNumberFieldDef, CliValidationDebugContext>;
            optionString: Validator<CliOptionStringFieldDef, CliValidationDebugContext>;
            optionStrings: Validator<CliOptionStringsFieldDef, CliValidationDebugContext>;
            optionBoolean: Validator<CliOptionBooleanFieldDef, CliValidationDebugContext>;
            optionNumber: Validator<CliOptionNumberFieldDef, CliValidationDebugContext>;
        },
        CliFieldDef,
        CliValidationDebugContext
    >(
        field => field.kind,
        {
            positionalString: validateCliPositionalStringFieldDef,
            positionalStrings: validateCliPositionalStringsFieldDef,
            positionalNumber: validateCliPositionalNumberFieldDef,
            optionString: validateCliOptionStringFieldDef,
            optionStrings: validateCliOptionStringsFieldDef,
            optionBoolean: validateCliOptionBooleanFieldDef,
            optionNumber: validateCliOptionNumberFieldDef,
        }
    );

const noDuplicateShortNames: Validator<NameAnd<CliFieldDef>, CliValidationDebugContext> =
    (context: ValidationContext) => (fields: NameAnd<CliFieldDef>): ErrorsOr<NameAnd<CliFieldDef>, ValidationIssue> => {
        const seen = new Map<string, string>();
        const issues: ValidationIssue[] = [];

        for (const [name, field] of Object.entries(fields)) {
            if (!isCliOptionFieldDef(field)) continue;
            const shortName = field.shortName;
            if (!shortName) continue;

            const previous = seen.get(shortName);
            if (previous) {
                issues.push({
                    kind: "validation",
                    severity: "error",
                    context: [...context, name, "shortName"],
                    message: `${renderContext([...context, name, "shortName"])} duplicates shortName '${shortName}' already used by '${previous}'`,
                    code: "duplicate.shortName",
                });
            } else {
                seen.set(shortName, name);
            }
        }

        if (issues.length === 0) return value(fields);
        return validationErrors(issues[0], issues.slice(1));
    };

const positionalRequiredMustComeBeforeOptional: Validator<NameAnd<CliFieldDef>, CliValidationDebugContext> =
    (context: ValidationContext) => (fields: NameAnd<CliFieldDef>): ErrorsOr<NameAnd<CliFieldDef>, ValidationIssue> => {
        const positionalEntries = Object.entries(fields).filter(
            (entry): entry is [string, CliPositionalFieldDef] => isCliPositionalFieldDef(entry[1])
        );
        const issues: ValidationIssue[] = [];

        let seenOptional = false;

        for (const [name, field] of positionalEntries) {
            if (field.required === false) seenOptional = true;
            if ((field.required === true || field.required === undefined) && seenOptional) {
                issues.push({
                    kind: "validation",
                    severity: "error",
                    context: [...context, name, "required"],
                    message: `${renderContext([...context, name, "required"])} required positional fields cannot appear after optional positional fields`,
                    code: "illegal.order",
                });
            }
        }

        if (issues.length === 0) return value(fields);
        return validationErrors(issues[0], issues.slice(1));
    };

const variadicPositionalMustBeLast: Validator<NameAnd<CliFieldDef>, CliValidationDebugContext> =
    (context: ValidationContext) => (fields: NameAnd<CliFieldDef>): ErrorsOr<NameAnd<CliFieldDef>, ValidationIssue> => {
        const positionalEntries = Object.entries(fields).filter(
            (entry): entry is [string, CliPositionalFieldDef] => isCliPositionalFieldDef(entry[1])
        );
        const issues: ValidationIssue[] = [];

        let seenVariadic = false;

        for (const [name, field] of positionalEntries) {
            if (seenVariadic) {
                issues.push({
                    kind: "validation",
                    severity: "error",
                    context: [...context, name],
                    message: `${renderContext([...context, name])} appears after a variadic positional field`,
                    code: "illegal.order",
                });
            }
            if (isCliPositionalStringsFieldDef(field) && field.variadic) seenVariadic = true;
        }

        if (issues.length === 0) return value(fields);
        return validationErrors(issues[0], issues.slice(1));
    };

export const validateCliFields: Validator<NameAnd<CliFieldDef>, CliValidationDebugContext> =
    combineValidators<NameAnd<CliFieldDef>, CliValidationDebugContext>(
        mustBeNameAndIfPresent<CliFieldDef, CliValidationDebugContext>(
            validateCliFieldDef
        ) as Validator<NameAnd<CliFieldDef>, CliValidationDebugContext>,
        noDuplicateShortNames,
        positionalRequiredMustComeBeforeOptional,
        variadicPositionalMustBeLast
    );

export const validateCliCommand: Validator<SomeCliCommand, CliValidationDebugContext> =
    mustBeObjectWithFields<SomeCliCommand, CliValidationDebugContext>({
        description: combineValidators(mustBeString, nonBlank),
        fields: validateCliFields,
        execute: mustBeFunction as Validator<CliExecute<CliRecord, void>, CliValidationDebugContext>,
    }, true);

const noOverlappingGroupAndCommandNames: Validator<CliGroup, CliValidationDebugContext> =
    (context: ValidationContext) => (group: CliGroup): ErrorsOr<CliGroup, ValidationIssue> => {
        const commandNames = Object.keys(group.commands ?? {});
        const groupNames = Object.keys(group.groups ?? {});
        const overlaps = commandNames.filter(name => groupNames.includes(name));

        if (overlaps.length === 0) return value(group);

        const issues: ValidationIssue[] = overlaps.map(name => ({
            kind: "validation",
            severity: "error",
            context,
            message: `${renderContext(context)} contains both a command and a group named '${name}'`,
            code: "duplicate.name",
        }));

        return validationErrors(issues[0], issues.slice(1));
    };

export const validateCliGroup: Validator<CliGroup, CliValidationDebugContext> =
    combineValidators<CliGroup, CliValidationDebugContext>(
        mustBeObjectWithFields<CliGroup, CliValidationDebugContext>({
            description: combineValidators(mustBeString, nonBlank),
            commands: mustBeNameAndIfPresent<SomeCliCommand, CliValidationDebugContext>(
                validateCliCommand
            ),
            groups: mustBeNameAndIfPresent<CliGroup, CliValidationDebugContext>(
                (context, observability) => input => validateCliGroup(context, observability)(input)
            ),
        }, true),
        noOverlappingGroupAndCommandNames
    );

export const validateCliModel: Validator<CliModel, CliValidationDebugContext> = validateCliGroup;