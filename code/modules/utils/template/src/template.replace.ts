import {errors, isErrors, value, type ErrorsOr} from "@laoban/errors";
import {
    makeTemplateIssue,
    type TemplateConfig,
    type TemplateIssue,
} from "./template.types";

type ParsedFunctionCall = {
    functionName: string;
    params: string[];
};

type ParsedExpression = {
    pathSegments: string[];
    functionCalls: ParsedFunctionCall[];
    rawExpression: string;
};

function appendWarnings(
    first?: TemplateIssue[],
    second?: TemplateIssue[],
): TemplateIssue[] | undefined {
    const result = [...(first ?? []), ...(second ?? [])];
    return result.length === 0 ? undefined : result;
}

function splitOutsideQuotesAndParens(input: string, separator: string): string[] {
    const result: string[] = [];
    let current = "";
    let inSingleQuote = false;
    let parenDepth = 0;

    for (let i = 0; i < input.length; i++) {
        const ch = input[i];

        if (ch === "'") {
            inSingleQuote = !inSingleQuote;
            current += ch;
            continue;
        }

        if (!inSingleQuote) {
            if (ch === "(") {
                parenDepth += 1;
                current += ch;
                continue;
            }
            if (ch === ")") {
                parenDepth = Math.max(0, parenDepth - 1);
                current += ch;
                continue;
            }
            if (ch === separator && parenDepth === 0) {
                result.push(current.trim());
                current = "";
                continue;
            }
        }

        current += ch;
    }

    result.push(current.trim());
    return result.filter((s) => s.length > 0);
}

function parsePathSegments(path: string): ErrorsOr<string[], TemplateIssue> {
    const trimmed = path.trim();

    if (trimmed.length === 0) {
        return errors(
            makeTemplateIssue("invalidExpression", "Template expression has an empty path", {
                expression: path,
            }),
        );
    }

    const segments: string[] = [];
    let current = "";
    let inSingleQuote = false;

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];

        if (ch === "'") {
            inSingleQuote = !inSingleQuote;
            continue;
        }

        if (ch === "." && !inSingleQuote) {
            if (current.trim().length === 0) {
                return errors(
                    makeTemplateIssue("invalidExpression", "Template path contains an empty segment", {
                        expression: path,
                    }),
                );
            }
            segments.push(current.trim());
            current = "";
            continue;
        }

        current += ch;
    }

    if (inSingleQuote) {
        return errors(
            makeTemplateIssue("invalidExpression", "Template path has an unterminated quoted segment", {
                expression: path,
            }),
        );
    }

    if (current.trim().length === 0) {
        return errors(
            makeTemplateIssue("invalidExpression", "Template path ends with an empty segment", {
                expression: path,
            }),
        );
    }

    segments.push(current.trim());
    return value(segments);
}

function parseFunctionCall(part: string, expression: string): ErrorsOr<ParsedFunctionCall, TemplateIssue> {
    const trimmed = part.trim();

    if (trimmed.length === 0) {
        return errors(
            makeTemplateIssue("invalidExpression", "Template expression contains an empty function call", {
                expression,
            }),
        );
    }

    const openIndex = trimmed.indexOf("(");

    if (openIndex < 0) {
        return value({
            functionName: trimmed,
            params: [],
        });
    }

    if (!trimmed.endsWith(")")) {
        return errors(
            makeTemplateIssue("invalidExpression", "Template function call is missing a closing ')'", {
                expression,
                functionName: trimmed.slice(0, openIndex).trim(),
            }),
        );
    }

    const functionName = trimmed.slice(0, openIndex).trim();
    const rawParams = trimmed.slice(openIndex + 1, -1);

    if (functionName.length === 0) {
        return errors(
            makeTemplateIssue("invalidExpression", "Template function call has no function name", {
                expression,
            }),
        );
    }

    const params =
        rawParams.trim().length === 0
            ? []
            : splitOutsideQuotesAndParens(rawParams, ",").map((s) => {
                const trimmedParam = s.trim();
                if (
                    trimmedParam.startsWith("'") &&
                    trimmedParam.endsWith("'") &&
                    trimmedParam.length >= 2
                ) {
                    return trimmedParam.slice(1, -1);
                }
                return trimmedParam;
            });

    return value({
        functionName,
        params,
    });
}

function parseExpression(expression: string): ErrorsOr<ParsedExpression, TemplateIssue> {
    const parts = splitOutsideQuotesAndParens(expression, "|");

    if (parts.length === 0) {
        return errors(
            makeTemplateIssue("invalidExpression", "Template expression is empty", {
                expression,
            }),
        );
    }

    const pathResult = parsePathSegments(parts[0]);
    if (isErrors(pathResult)) return pathResult;

    const functionCalls: ParsedFunctionCall[] = [];
    let warnings = pathResult.warnings;

    for (const fnPart of parts.slice(1)) {
        const parsedFn = parseFunctionCall(fnPart, expression);
        if (isErrors(parsedFn)) return parsedFn;
        functionCalls.push(parsedFn.value);
        warnings = appendWarnings(warnings, parsedFn.warnings);
    }

    return value(
        {
            pathSegments: pathResult.value,
            functionCalls,
            rawExpression: expression,
        },
        warnings,
    );
}

function lookupPath<T>(dictionary: T, pathSegments: string[]): unknown {
    let current: unknown = dictionary;

    for (const segment of pathSegments) {
        if (current === null || current === undefined) return undefined;
        if (typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[segment];
    }

    return current;
}

function toRenderedString(v: unknown): string {
    if (v === undefined || v === null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
    return JSON.stringify(v);
}

function resolveMissingValue<T>(
    expression: string,
    pathSegments: string[],
    rawToken: string,
    config: TemplateConfig<T>,
): ErrorsOr<string, TemplateIssue> {
    const issue = makeTemplateIssue(
        "missingValue",
        `Template value not found for path ${pathSegments.join(".")}`,
        {
            expression,
            path: pathSegments,
            severity: config.onMissing === "warning" ? "warning" : "error",
        },
    );

    switch (config.onMissing) {
        case "error":
            return errors(issue);
        case "warning":
            return value("", [issue]);
        case "empty":
            return value("");
        case "keep":
            return value(rawToken);
    }
}

function applyFunctionPipeline<T>(
    initialValue: unknown,
    parsedExpression: ParsedExpression,
    dictionary: T,
    config: TemplateConfig<T>,
): ErrorsOr<unknown, TemplateIssue> {
    let currentValue = initialValue;
    let warnings: TemplateIssue[] | undefined = undefined;

    for (const functionCall of parsedExpression.functionCalls) {
        const fn = config.functions[functionCall.functionName];

        if (!fn) {
            const issue = makeTemplateIssue(
                "unknownFunction",
                `Unknown template function ${functionCall.functionName}`,
                {
                    expression: parsedExpression.rawExpression,
                    functionName: functionCall.functionName,
                },
            );

            return warnings ? errors(issue, undefined, warnings) : errors(issue);
        }

        const result = fn({
            value: currentValue,
            dictionary,
            params: functionCall.params,
            expression: parsedExpression.rawExpression,
            functionName: functionCall.functionName,
            config,
        });

        if (isErrors(result)) {
            const converted = result.errors.map((issue) =>
                issue.kind
                    ? issue
                    : makeTemplateIssue("functionFailed", issue.message, {
                        expression: parsedExpression.rawExpression,
                        functionName: functionCall.functionName,
                        severity: issue.severity,
                        code: issue.code,
                    }),
            );

            const [first, ...rest] = converted;
            return errors(first, rest, appendWarnings(warnings, result.warnings));
        }

        currentValue = result.value;
        warnings = appendWarnings(warnings, result.warnings);
    }

    return value(currentValue, warnings);
}

export function replaceTemplateToken<T>(
    rawToken: string,
    dictionary: T,
    config: TemplateConfig<T>,
): ErrorsOr<string, TemplateIssue> {
    const expression = config.variableDefn.removeStartEnd(rawToken).trim();

    const parsed = parseExpression(expression);
    if (isErrors(parsed)) return parsed;

    const resolved = lookupPath(dictionary, parsed.value.pathSegments);

    if (resolved === undefined) {
        return resolveMissingValue(expression, parsed.value.pathSegments, rawToken, config);
    }

    const applied = applyFunctionPipeline(resolved, parsed.value, dictionary, config);
    if (isErrors(applied)) return applied;

    return value(
        toRenderedString(applied.value),
        appendWarnings(parsed.warnings, applied.warnings),
    );
}