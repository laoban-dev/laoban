import {
    composeOr, ifPresent,
    mustBeArrayOf,
    mustBeBoolean,
    mustBeBooleanIfPresent,
    mustBeNameAnd,
    mustBeNameAndIfPresent,
    mustBeObjectWithFields,
    mustBeString,
    mustBeStringIfPresent,
    nullableValidator,
    Validator,
} from "@laoban/validation";
import {
    CommandArgs,
    EnvName,
    EnvValue,
    LaobanCommand,
    LaobanScript,
    RawLaobanCommand,
    RawLaobanCommandObject,
    RawLaobanScript,
    ScriptGuard,
} from "./scripts.domain";

/**
 * Validates a script guard.
 *
 * Guards may currently be:
 * - a literal boolean
 * - a string, typically containing interpolation such as `${packageDetails.guards.test}`
 */
export const validateScriptGuard: Validator<ScriptGuard> = composeOr({
    boolean: mustBeBoolean,
    string: mustBeString,
});

/**
 * Validates command arguments.
 *
 * commandArgs is a map from CLI argument name to help text.
 */
export const validateCommandArgs: Validator<CommandArgs | undefined> =
    mustBeNameAndIfPresent(mustBeString);

/**
 * Validates environment variables.
 *
 * env is a map from environment variable name to value.
 */
export const validateEnv: Validator<Record<EnvName, EnvValue> | undefined> =
    mustBeNameAndIfPresent(mustBeString);

/**
 * Validates a raw command in object form.
 */
export const validateRawLaobanCommandObject: Validator<RawLaobanCommandObject> =
    mustBeObjectWithFields<RawLaobanCommandObject>(
        {
            name: mustBeStringIfPresent,
            command: mustBeString,
            guard: ifPresent(validateScriptGuard),
            directory: mustBeStringIfPresent,
            status: mustBeBooleanIfPresent,
        },
        true
    );

/**
 * Validates a raw command.
 *
 * Raw commands may be written either as:
 * - a shorthand string command
 * - a full command object
 */
export const validateRawLaobanCommand: Validator<RawLaobanCommand> = composeOr({
    string: mustBeString,
    object: validateRawLaobanCommandObject as Validator<RawLaobanCommand>,
});

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
            guard: ifPresent(validateScriptGuard),
            osGuard: mustBeStringIfPresent,
            inLinksOrder: mustBeBooleanIfPresent,
            showShell: mustBeBooleanIfPresent,
            commandArgs: validateCommandArgs,
            env: validateEnv,
        },
        true
    );

/**
 * Validates a normalized command.
 *
 * In normalized form:
 * - commands are always objects
 * - status is always present
 */
export const validateLaobanCommand: Validator<LaobanCommand> =
    mustBeObjectWithFields<LaobanCommand>(
        {
            name: mustBeStringIfPresent,
            command: mustBeString,
            guard: ifPresent(validateScriptGuard),
            directory: mustBeStringIfPresent,
            status: mustBeBoolean,
        },
        true
    );

/**
 * Validates a fully normalized script.
 *
 * In normalized form:
 * - commands are always objects
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
        true
    );