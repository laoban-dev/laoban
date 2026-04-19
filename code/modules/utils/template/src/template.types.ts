import {type BaseIssue, type ErrorsOr} from "@laoban/errors";
import {type Observability} from "@laoban/observability";

export type TemplateDebugContext =
    | "template"
    | "template.parse"
    | "template.resolve"
    | "template.function";

export type VariableDefn = {
    regex: RegExp;
    removeStartEnd: (raw: string) => string;
};

export const dollarsBracesVarDefn: VariableDefn = {
    regex: /(\$\{[^}]*\})/g,
    removeStartEnd: s => s.slice(2, -1)
};

export const mustachesVarDefn: VariableDefn = {
    regex: /(\{\{.*?\}\})/g,
    removeStartEnd: s => s.slice(2, -2)
};

export const colonPrefixedVarDefn: VariableDefn = {
    regex: /(:[a-zA-Z0-9._]+)/g,
    removeStartEnd: s => s.slice(1)
};

export const doubleAngleVarDefn: VariableDefn = {
    regex: /(<<[^>]*>>)/g,
    removeStartEnd: s => s.slice(2, -2)
};

export type MissingValueMode = "error" | "warning" | "empty" | "keep";

export type TemplateIssueKind =
    | "missingValue"
    | "invalidExpression"
    | "unknownFunction"
    | "functionFailed";

export type TemplateIssue = BaseIssue<
    TemplateIssueKind,
    {
        expression?: string;
        path?: string[];
        functionName?: string;
    }
>;
export function makeTemplateIssue(
    kind: TemplateIssueKind,
    message: string,
    extras?: {
        expression?: string;
        path?: string[];
        functionName?: string;
        severity?: "error" | "warning";
        code?: string;
    }
): TemplateIssue {
    return {
        kind,
        message,
        severity: extras?.severity ?? "error",
        code: extras?.code,
        context: {
            expression: extras?.expression,
            path: extras?.path,
            functionName: extras?.functionName
        }
    };
}
export type TemplateFn<T> = (args: {
    value: unknown;
    dictionary: T;
    params: string[];
    expression: string;
    functionName: string;
    config: TemplateConfig<T>;
}) => ErrorsOr<unknown, TemplateIssue>;

export type TemplateFns<T> = Record<string, TemplateFn<T>>;

export type TemplateConfig<T> = {
    observability: Observability<TemplateDebugContext>;
    variableDefn: VariableDefn;
    onMissing: MissingValueMode;
    functions: TemplateFns<T>;
};

export type Template = {
    raw: string;
};

export type TemplateEngine =
    <T>(template: Template | string, dictionary: T, config?: Partial<TemplateConfig<T>>) => ErrorsOr<string, TemplateIssue>;