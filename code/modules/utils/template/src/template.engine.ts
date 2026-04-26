import {errors, isErrors, value, type ErrorsOr} from "@laoban/errors";
import {defaultTemplateFns} from "./template.functions";
import {replaceTemplateToken} from "./template.replace";
import {
    dollarsBracesVarDefn,
    type Template,
    type TemplateConfig,
    type TemplateEngine,
    type TemplateIssue,
} from "./template.types";

function appendWarnings(
    first?: TemplateIssue[],
    second?: TemplateIssue[],
): TemplateIssue[] | undefined {
    const result = [...(first ?? []), ...(second ?? [])];
    return result.length === 0 ? undefined : result;
}

function templateRaw(template: Template | string): string {
    return typeof template === "string" ? template : template.raw;
}

function fullTemplateConfig<T>(config?: Partial<TemplateConfig<T>>): TemplateConfig<T> {
    return {
        variableDefn: config?.variableDefn ?? dollarsBracesVarDefn,
        onMissing: config?.onMissing ?? "error",
        functions: config?.functions ?? defaultTemplateFns<T>(),
    } as TemplateConfig<T>;
}

export const renderTemplate: TemplateEngine = <T>(
    template: Template | string,
    dictionary: T,
    partialConfig?: Partial<TemplateConfig<T>>,
): ErrorsOr<string, TemplateIssue> => {
    const config = fullTemplateConfig(partialConfig);
    const raw = templateRaw(template);
    const regex = new RegExp(config.variableDefn.regex.source, config.variableDefn.regex.flags);

    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let output = "";
    let warnings: TemplateIssue[] | undefined = undefined;

    while ((match = regex.exec(raw)) !== null) {
        const matchedText = match[0];
        const startIndex = match.index;

        output += raw.slice(lastIndex, startIndex);

        const replaced = replaceTemplateToken(matchedText, dictionary, config);
        if (isErrors(replaced)) {
            const [first, ...rest] = replaced.errors;
            return errors(first, rest, appendWarnings(warnings, replaced.warnings));
        }

        output += replaced.value;
        warnings = appendWarnings(warnings, replaced.warnings);
        lastIndex = startIndex + matchedText.length;
    }

    output += raw.slice(lastIndex);

    return value(output, warnings);
};