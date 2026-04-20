export type ScriptName = string;
export type CommandString = string;
export type CommandArgName = string;
export type CommandArgHelp = string;
export type EnvName = string;
export type EnvValue = string;
export type DirectoryName = string;
export type OsGuard = string;

/**
 * A raw guard value as written in laoban.json.
 *
 * This allows the simple shorthand forms:
 * - true
 * - false
 * - "${some.template.value}"
 *
 * and the richer form:
 * - { value: "${some.template.value}", default: true }
 */
export type RawScriptGuard = boolean | string | RawScriptGuardObject;

/**
 * A raw guard object as written in laoban.json.
 *
 * The value is typically a templated string that will later be resolved.
 * default provides the fallback if the value cannot be resolved.
 */
export interface RawScriptGuardObject {
    value: string;
    default?: boolean;
}

/**
 * A normalized guard value used after script normalization.
 *
 * Normalization removes the primitive shorthand forms and always uses an
 * explicit object shape. This makes downstream execution code simpler.
 */
export interface ScriptGuard {
    value: boolean | string;
    default?: boolean;
}

/**
 * Command arguments exposed by a script through the CLI.
 *
 * The key is the argument name, used both as the CLI option name and as the
 * interpolation variable name. The value is the help text shown in CLI help.
 *
 * Example:
 * {
 *   "passThruArgs": "the arguments that are passed through to maven"
 * }
 *
 * This would typically add a CLI option like `--passThruArgs <value>` and make
 * the supplied value available for interpolation as `${passThruArgs}`.
 */
export type CommandArgs = Record<CommandArgName, CommandArgHelp>;

/**
 * A named script as written in raw laoban.json.
 *
 * This is the user-authored configuration shape and stays close to the JSON.
 * In particular, commands may use the shorthand string form and guards may use
 * either primitive or object form.
 */
export interface RawLaobanScript {
    /**
     * Human-readable description for help, listing, and diagnostics.
     *
     * This is required because each named script is exposed through the CLI.
     */
    description: string;

    /** The raw commands that make up this script. */
    commands: RawLaobanCommand[];

    /** Optional script-level guard controlling whether the script applies. */
    guard?: RawScriptGuard;

    /**
     * Optional operating-system guard.
     *
     * This is a short operating-system identifier such as `Windows_NT`.
     */
    osGuard?: OsGuard;

    /** Optional flag indicating that execution should follow link order. */
    inLinksOrder?: boolean;

    /** Optional flag indicating that shell commands should be shown. */
    showShell?: boolean;

    /**
     * Optional CLI command arguments exposed by this script.
     *
     * Keys are argument names and values are the help text shown in the CLI.
     */
    commandArgs?: CommandArgs;

    /** Optional environment variables for the script. */
    env?: Record<EnvName, EnvValue>;
}

/**
 * A raw command entry as written in laoban.json.
 *
 * Commands may be written either as a shorthand command string or as a full
 * object with command-specific settings.
 */
export type RawLaobanCommand = CommandString | RawLaobanCommandObject;

/**
 * A command written in object form in raw laoban.json.
 */
export interface RawLaobanCommandObject {
    /** Optional human-readable name for logs, status, or diagnostics. */
    name?: string;

    /** The command text to execute. */
    command: CommandString;

    /** Optional command-level guard. */
    guard?: RawScriptGuard;

    /** Optional working directory for this command. */
    directory?: DirectoryName;

    /** Optional flag controlling whether this command emits status information. */
    status?: boolean;
}

/**
 * A script after validation and normalization.
 *
 * This is the execution-friendly form:
 * - commands are always objects
 * - guards are always explicit objects
 * - optional collections are defaulted
 * - execution flags are always explicit
 */
export interface LaobanScript {
    /**
     * Human-readable description for help, listing, and diagnostics.
     *
     * This is required because each named script is exposed through the CLI.
     */
    description: string;

    /** The normalized commands for this script. */
    commands: LaobanCommand[];

    /** Optional script-level guard controlling whether the script applies. */
    guard?: ScriptGuard;

    /**
     * Optional operating-system guard.
     *
     * This is a short operating-system identifier such as `Windows_NT`.
     */
    osGuard?: OsGuard;

    /** Whether execution should follow link order. */
    inLinksOrder: boolean;

    /** Whether shell commands should be shown during execution. */
    showShell: boolean;

    /** CLI command arguments for this script, defaulted to an empty object. */
    commandArgs: CommandArgs;

    /** Environment variables for this script, defaulted to an empty object. */
    env: Record<EnvName, EnvValue>;
}

/**
 * A command after validation and normalization.
 *
 * This is the execution-friendly form with shorthand removed and defaults
 * applied.
 */
export interface LaobanCommand {
    /** Optional human-readable name for logs, status, or diagnostics. */
    name?: string;

    /** The command text to execute. */
    command: CommandString;

    /** Optional command-level guard. */
    guard?: ScriptGuard;

    /** Optional working directory for this command. */
    directory?: DirectoryName;

    /** Whether this command emits status information. */
    status: boolean;
}

/** Raw scripts keyed by script name. */
export type RawLaobanScripts = Record<ScriptName, RawLaobanScript>;

/** Normalized scripts keyed by script name. */
export type LaobanScripts = Record<ScriptName, LaobanScript>;