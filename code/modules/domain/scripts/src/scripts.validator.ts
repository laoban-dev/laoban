import {
    AnyValidationContext,
    composeOr,
    ifPresent,
    mustBeArrayOf,
    mustBeBoolean,
    mustBeBooleanIfPresent,
    mustBeNameAnd,
    mustBeNameAndIfPresent,
    mustBeObjectWithFields,
    mustBeOneOf,
    mustBeString,
    mustBeStringIfPresent,
    mustBeStringOrObject, renderContext, validationError,
    type Validator,
} from "@laoban/validation"
import {
    type CommandArgs,
    type EnvName,
    type EnvValue,
    type ExecutionScope,
    type LaobanCommand,
    type LaobanScript,
    type RawLaobanCommand,
    type RawLaobanCommandObject,
    type RawLaobanScript,
    type RawScriptGuard,
    type RawScriptGuardObject,
    type ScriptGuard,
} from "./scripts.domain"

/**
 * Validates a raw guard object.
 *
 * Raw object guards are written as:
 * { value: "${...}", default?: boolean }
 */
export const validateRawScriptGuardObject: Validator<RawScriptGuardObject> =
    mustBeObjectWithFields<RawScriptGuardObject>(
        {
            value: mustBeString,
            default: mustBeBooleanIfPresent,
        },
        true,
    )

/**
 * Validates a raw script guard.
 *
 * Raw guards may be:
 * - a literal boolean
 * - a string, typically containing interpolation such as `${packageDetails.guards.test}`
 * - an object with value/default
 *
 * We do not use composeOr here because the branch can be selected cleanly
 * from the runtime type. If the input is an object, validate it as an object
 * and do not report that it failed to be a string or boolean.
 */
export const validateRawScriptGuard: Validator<RawScriptGuard, AnyValidationContext> =
    (context, observability) => input => {
        if (typeof input === "boolean") return {value: input}
        if (typeof input === "string") return {value: input}
        if (typeof input === "object" && input !== null && !Array.isArray(input)) {
            return validateRawScriptGuardObject(context, observability)(
                input as RawScriptGuardObject,
            )
        }
        return {
            errors: [
                validationError(
                    context,
                    `${renderContext(context)} must be a boolean, string or object but was ${
                        input === null ? "null" :
                            Array.isArray(input) ? "array" :
                                typeof input
                    }`,
                    {code: "wrong.type"},
                ),
            ],
        }
    }
/**
 * Validates a normalized script guard.
 *
 * Normalized guards are always objects.
 */
export const validateScriptGuard: Validator<ScriptGuard> =
    mustBeObjectWithFields<ScriptGuard>(
        {
            value: composeOr({
                boolean: mustBeBoolean,
                string: mustBeString,
            }),
            default: mustBeBooleanIfPresent,
        },
        true,
    )

/**
 * Validates command arguments.
 *
 * commandArgs is a map from CLI argument name to help text.
 */
export const validateCommandArgs: Validator<CommandArgs | undefined> =
    mustBeNameAndIfPresent(mustBeString)

/**
 * Validates environment variables.
 *
 * env is a map from environment variable name to value.
 */
export const validateEnv: Validator<Record<EnvName, EnvValue> | undefined> =
    mustBeNameAndIfPresent(mustBeString)

/**
 * Validates execution scope.
 */
export const validateExecutionScope: Validator<ExecutionScope> =
    mustBeOneOf("eachPackage", "oncePerWorkSpace")

/**
 * Validates a raw command in object form.
 */
export const validateRawLaobanCommandObject: Validator<RawLaobanCommandObject> =
    mustBeObjectWithFields<RawLaobanCommandObject>(
        {
            name: mustBeStringIfPresent,
            command: mustBeString,
            guard: ifPresent(validateRawScriptGuard),
            directory: mustBeStringIfPresent,
            status: mustBeBooleanIfPresent,
            executionScope: ifPresent(validateExecutionScope),
        },
        true,
    )

/**
 * Validates a raw command.
 *
 * Raw commands may be written either as:
 * - a shorthand string command
 * - a full command object
 *
 * We do not use composeOr here. If the input is an object, validate it as
 * a command object. Reporting that it is "not a string" is noise.
 */
export const validateRawLaobanCommand: Validator<RawLaobanCommand> =
    mustBeStringOrObject(
        validateRawLaobanCommandObject as Validator<RawLaobanCommandObject>,
    ) as Validator<RawLaobanCommand>

/**
 * Validates a raw laoban script as loaded from laoban.json.
 *
 * This validator accepts the user-authored shape, including optional fields
 * that will later be defaulted during normalization.
 */
export const validateRawLaobanScript: Validator<RawLaobanScript> =
    mustBeObjectWithFields<RawLaobanScript>(
        {
            description: mustBeString,
            commands: mustBeArrayOf(validateRawLaobanCommand),
            guard: ifPresent(validateRawScriptGuard),
            osGuard: mustBeStringIfPresent,
            inLinksOrder: mustBeBooleanIfPresent,
            showShell: mustBeBooleanIfPresent,
            commandArgs: validateCommandArgs,
            env: validateEnv,
        },
        true,
    )

/**
 * Validates a normalized command.
 *
 * In normalized form:
 * - commands are always objects
 * - status is always present
 * - guards are always objects
 * - executionScope is always present
 */
export const validateLaobanCommand: Validator<LaobanCommand> =
    mustBeObjectWithFields<LaobanCommand>(
        {
            name: mustBeStringIfPresent,
            command: mustBeString,
            guard: ifPresent(validateScriptGuard),
            directory: mustBeStringIfPresent,
            status: mustBeBoolean,
            executionScope: validateExecutionScope,
        },
        true,
    )

/**
 * Validates a fully normalized script.
 *
 * In normalized form:
 * - commands are always objects
 * - guards are always objects
 * - inLinksOrder is always present
 * - showShell is always present
 * - commandArgs is always present
 * - env is always present
 */
export const validateLaobanScript: Validator<LaobanScript> =
    mustBeObjectWithFields<LaobanScript>(
        {
            description: mustBeString,
            commands: mustBeArrayOf(validateLaobanCommand),
            guard: ifPresent(validateScriptGuard),
            osGuard: mustBeStringIfPresent,
            inLinksOrder: mustBeBoolean,
            showShell: mustBeBoolean,
            commandArgs: mustBeNameAnd(mustBeString, true),
            env: mustBeNameAnd(mustBeString, true),
        },
        true,
    )