import {value} from "@laoban/errors";
import {
    chainValidators, combineValidators,
    composeTypedOr,
    exactLength, ifPresent,
    mustBeArrayOfIfPresent,
    mustBeBooleanIfPresent,
    mustBeLiteral,
    mustBeNameAnd,
    mustBeNumberIfPresent,
    mustBeObjectWithFields,
    mustBeString,
    mustBeStringIfPresent,
    mustBeType,
    nonBlank,
    oneValidationError,
    renderContext,
    type Validator
} from "@laoban/validation";
import type {
    AnyCliCommand,
    BasicCliContext,
    CliGroup,
    CliModel,
    CliOptionParameterDef,
    CliPositionalParameterDef,
    CliRoot
} from "./cli.dsl";

type AnyCliNode<C extends BasicCliContext = BasicCliContext> =
    CliGroup<C> | AnyCliCommand<C>;

const validateDescription = chainValidators(mustBeString, nonBlank);
const validateName = chainValidators(mustBeString, nonBlank);
const validateVersionIfPresent = ifPresent(combineValidators(mustBeStringIfPresent, nonBlank));

const validateShortNameIfPresent = chainValidators(
    mustBeStringIfPresent,
    (context, observability) => (input) =>
        input === undefined
            ? value(input)
            : exactLength(1)(context, observability)(input)
);

const validateNoDefaultWhenRequired = <T extends { required?: boolean; defaultValue?: unknown }>(): Validator<T> =>
    (context) => (input) =>
        input.required === true && input.defaultValue !== undefined
            ? oneValidationError(
                context,
                `${renderContext(context)} cannot have both required=true and defaultValue`,
                {code: "illegal.combination"}
            )
            : value(input);

const validateNoOverlappingKeys = <C extends BasicCliContext = BasicCliContext>(): Validator<AnyCliCommand<C>> =>
    (context) => (input) => {
        const positionalKeys = new Set(Object.keys(input.positionals ?? {}));
        const overlaps = Object.keys(input.options ?? {}).filter(k => positionalKeys.has(k));
        return overlaps.length === 0
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} has keys present in both positionals and options: ${overlaps.sort().join(", ")}`,
                {code: "duplicate.key"}
            );
    };

const validateUniqueShortNames = <C extends BasicCliContext = BasicCliContext>(): Validator<AnyCliCommand<C>> =>
    (context) => (input) => {
        const seen = new Set<string>();
        const duplicates = new Set<string>();

        for (const def of Object.values(input.options ?? {})) {
            const shortName = (def as { shortName?: string }).shortName;
            if (!shortName) continue;
            if (seen.has(shortName)) duplicates.add(shortName);
            seen.add(shortName);
        }

        return duplicates.size === 0
            ? value(input)
            : oneValidationError(
                context,
                `${renderContext(context)} has duplicate shortName values: ${[...duplicates].sort().join(", ")}`,
                {code: "duplicate.shortName"}
            );
    };

const validateCliPositionalStringParameterDef =
    mustBeObjectWithFields<CliPositionalParameterDef<string>>({
        type: mustBeLiteral("string"),
        description: validateDescription,
        required: mustBeBooleanIfPresent
    }, true);

const validateCliPositionalNumberParameterDef =
    mustBeObjectWithFields<CliPositionalParameterDef<number>>({
        type: mustBeLiteral("number"),
        description: validateDescription,
        required: mustBeBooleanIfPresent
    }, true);

const validateCliPositionalStringArrayParameterDef =
    mustBeObjectWithFields<CliPositionalParameterDef<string[]>>({
        type: mustBeLiteral("string[]"),
        description: validateDescription,
        required: mustBeBooleanIfPresent
    }, true);

export const validateCliPositionalParameterDef = composeTypedOr(
    t => t.type,
    {
        string: validateCliPositionalStringParameterDef,
        number: validateCliPositionalNumberParameterDef,
        "string[]": validateCliPositionalStringArrayParameterDef
    }
);

const validateCliOptionStringParameterDef =
    chainValidators(
        mustBeObjectWithFields<CliOptionParameterDef<string>>({
            type: mustBeLiteral("string"),
            description: validateDescription,
            required: mustBeBooleanIfPresent,
            shortName: validateShortNameIfPresent,
            defaultValue: mustBeStringIfPresent
        }, true),
        validateNoDefaultWhenRequired<CliOptionParameterDef<string>>()
    );

const validateCliOptionNumberParameterDef =
    chainValidators(
        mustBeObjectWithFields<CliOptionParameterDef<number>>({
            type: mustBeLiteral("number"),
            description: validateDescription,
            required: mustBeBooleanIfPresent,
            shortName: validateShortNameIfPresent,
            defaultValue: mustBeNumberIfPresent
        }, true),
        validateNoDefaultWhenRequired<CliOptionParameterDef<number>>()
    );

const validateCliOptionBooleanParameterDef =
    chainValidators(
        mustBeObjectWithFields<CliOptionParameterDef<boolean>>({
            type: mustBeLiteral("boolean"),
            description: validateDescription,
            required: mustBeBooleanIfPresent,
            shortName: validateShortNameIfPresent,
            defaultValue: mustBeBooleanIfPresent
        }, true),
        validateNoDefaultWhenRequired<CliOptionParameterDef<boolean>>()
    );

const validateCliOptionStringArrayParameterDef =
    chainValidators(
        mustBeObjectWithFields<CliOptionParameterDef<string[]>>({
            type: mustBeLiteral("string[]"),
            description: validateDescription,
            required: mustBeBooleanIfPresent,
            shortName: validateShortNameIfPresent,
            defaultValue: mustBeArrayOfIfPresent(mustBeString)
        }, true),
        validateNoDefaultWhenRequired<CliOptionParameterDef<string[]>>()
    );

export const validateCliOptionParameterDef = composeTypedOr(
    t => t.type,
    {
        string: validateCliOptionStringParameterDef,
        number: validateCliOptionNumberParameterDef,
        boolean: validateCliOptionBooleanParameterDef,
        "string[]": validateCliOptionStringArrayParameterDef
    }
);

function makeValidateCliCommand<C extends BasicCliContext = BasicCliContext>(): Validator<AnyCliCommand<C>> {
    return chainValidators(
        mustBeObjectWithFields<AnyCliCommand<C>>({
            nodeType: mustBeLiteral("command"),
            description: validateDescription,
            positionals: mustBeNameAnd(validateCliPositionalParameterDef, true),
            options: mustBeNameAnd(validateCliOptionParameterDef, true),
            execute: mustBeType(x => typeof x === "function", "function") as any
        }, true),
        validateNoOverlappingKeys<C>(),
        validateUniqueShortNames<C>()
    );
}

function makeValidateCliGroup<C extends BasicCliContext = BasicCliContext>(
    validateNode: Validator<AnyCliNode<C>>
): Validator<CliGroup<C>> {
    return mustBeObjectWithFields<CliGroup<C>>({
        nodeType: mustBeLiteral("group"),
        description: validateDescription,
        children: mustBeNameAnd(validateNode, true)
    }, true);
}

function makeValidateCliRoot<C extends BasicCliContext = BasicCliContext>(
    validateNode: Validator<AnyCliNode<C>>
): Validator<CliRoot<C>> {
    return mustBeObjectWithFields<CliRoot<C>>({
        nodeType: mustBeLiteral("root"),
        name: validateName,
        description: validateDescription,
        version: validateVersionIfPresent,
        children: mustBeNameAnd(validateNode, true)
    }, true);
}

export function makeValidateCliNode<C extends BasicCliContext = BasicCliContext>(): Validator<AnyCliNode<C>> {
    let validateNode!: Validator<AnyCliNode<C>>;

    const validateGroup: Validator<CliGroup<C>> =
        (context, observability) => (input) =>
            makeValidateCliGroup<C>(validateNode)(context, observability)(input);

    const validateCommand = makeValidateCliCommand<C>();

    validateNode = composeTypedOr(
        t => t.nodeType,
        {
            group: validateGroup,
            command: validateCommand
        }
    );

    return validateNode;
}

export function makeValidateCliCommandDef<C extends BasicCliContext = BasicCliContext>(): Validator<AnyCliCommand<C>> {
    return makeValidateCliCommand<C>();
}

export function makeValidateCliGroupDef<C extends BasicCliContext = BasicCliContext>(): Validator<CliGroup<C>> {
    return makeValidateCliGroup<C>(makeValidateCliNode<C>());
}

export function makeValidateCliRootDef<C extends BasicCliContext = BasicCliContext>(): Validator<CliRoot<C>> {
    return makeValidateCliRoot<C>(makeValidateCliNode<C>());
}

export function makeValidateCliModel<C extends BasicCliContext = BasicCliContext>(): Validator<CliModel<C>> {
    return makeValidateCliRootDef<C>() as Validator<CliModel<C>>;
}