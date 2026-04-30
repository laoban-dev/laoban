// observability.debug.ts

import {BaseIssue, errors, ErrorsOr, value} from "@laoban/errors"

export type LogLevel = "error" | "warn" | "info" | "debug"

export type DebugNamePart = string
export type DebugName = readonly DebugNamePart[]

/**
 * Per-area debug configuration.
 *
 * [] means the whole area is enabled at that level.
 *
 * Example:
 *
 * {
 *   debug: []
 * }
 *
 * means:
 *
 * script
 * script:type1
 * script:type2
 *
 * all match, assuming this config is attached to the "script" area.
 *
 * A non-empty list means only those child paths are enabled.
 *
 * {
 *   debug: [["parse"]]
 * }
 *
 * means:
 *
 * template:parse
 * template:parse:tokens
 *
 * match, but:
 *
 * template
 * template:render
 *
 * do not.
 */
export type DebugAreaConfig = Partial<Record<LogLevel, readonly DebugName[]>>

/**
 * Root debug configuration.
 *
 * Example:
 *
 * {
 *   script: {
 *     debug: []
 *   },
 *   template: {
 *     debug: [["parse"]]
 *   }
 * }
 */
export type DebugConfig = Readonly<Record<string, DebugAreaConfig>>

export type DebugParseIssueKind =
    | "emptyDebugArea"
    | "emptyDebugNamePart"
    | "invalidDebugLevel"

export type DebugParseIssue = BaseIssue<DebugParseIssueKind, {
    raw: string
    entry?: string
    level?: string
}>

export const logLevels: readonly LogLevel[] = [
    "error",
    "warn",
    "info",
    "debug",
]

export const isLogLevel = (s: string): s is LogLevel =>
    (logLevels as readonly string[]).includes(s)

export const emptyDebugConfig: DebugConfig = {}

export const parseDebugName = (raw: string): ErrorsOr<DebugName, DebugParseIssue> => {
    const trimmed = raw.trim()

    if (trimmed.length === 0)
        return errors({
            kind: "emptyDebugArea",
            message: "Debug name cannot be empty",
            context: {raw},
        })

    const rawParts = trimmed.split(":")

    const emptyPart = rawParts.find(part => part.trim().length === 0)
    if (emptyPart !== undefined)
        return errors({
            kind: "emptyDebugNamePart",
            message: `Debug name '${raw}' contains an empty ':' segment`,
            context: {raw},
        })

    return value(rawParts.map(part => part.trim()))
}

export const renderDebugName = (name: DebugName): string =>
    name.join(":")

export const debugNameStartsWith = (
    actual: DebugName,
    configured: DebugName,
): boolean =>
    configured.length <= actual.length &&
    configured.every((part, index) => actual[index] === part)

export const shouldDebug = (
    debugConfig: DebugConfig,
    debugName: DebugName,
    level: LogLevel,
): boolean => {
    const [area, ...rest] = debugName
    if (!area) return false

    const areaConfig = debugConfig[area]
    if (!areaConfig) return false

    const configuredNames = areaConfig[level]
    if (!configuredNames) return false

    return configuredNames.length === 0 ||
        configuredNames.some(configuredName =>
            debugNameStartsWith(rest, configuredName),
        )
}

export const addDebugName = (
    config: DebugConfig,
    level: LogLevel,
    debugName: DebugName,
): DebugConfig => {
    const [area, ...rest] = debugName
    if (!area) return config

    const existingAreaConfig = config[area] ?? {}
    const existingLevelConfig = existingAreaConfig[level]

    const nextLevelConfig =
        existingLevelConfig === undefined
            ? rest.length === 0
                ? []
                : [rest]
            : existingLevelConfig.length === 0
                ? []
                : rest.length === 0
                    ? []
                    : [...existingLevelConfig, rest]

    return {
        ...config,
        [area]: {
            ...existingAreaConfig,
            [level]: nextLevelConfig,
        },
    }
}

/**
 * Parses the command-line debug option.
 *
 * Examples:
 *
 * "script,template:parse"
 *
 * becomes:
 *
 * {
 *   script: {
 *     debug: []
 *   },
 *   template: {
 *     debug: [["parse"]]
 *   }
 * }
 */
export const parseDebugConfig = (
    raw: string | undefined,
    level: LogLevel = "debug",
): ErrorsOr<DebugConfig, DebugParseIssue> => {
    if (raw === undefined || raw.trim().length === 0)
        return value(emptyDebugConfig)

    if (!isLogLevel(level))
        return errors({
            kind: "invalidDebugLevel",
            message: `Invalid debug level '${level}'`,
            context: {raw, level},
        })

    const entries = raw
        .split(",")
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0)

    let result: DebugConfig = emptyDebugConfig
    const foundErrors: DebugParseIssue[] = []

    for (const entry of entries) {
        const parsedName = parseDebugName(entry)

        if ("errors" in parsedName) {
            foundErrors.push(...parsedName.errors.map(issue => ({
                ...issue,
                context: {
                    ...(issue.context ?? {raw}),
                    raw,
                    entry,
                },
            })))
        } else {
            result = addDebugName(result, level, parsedName.value)
        }
    }

    if (foundErrors.length > 0) {
        const [first, ...rest] = foundErrors
        return errors(first, rest)
    }

    return value(result)
}