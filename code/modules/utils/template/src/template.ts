export type Template<T> = {
    raw: string
}

export type VariableDefn = {
    regex: RegExp
    removeStartEnd: (raw: string) => string
}
export const dollarsBracesVarDefn: VariableDefn = {
    regex: /(\$\{[^}]*\})/g,
    removeStartEnd: s => s.slice(2, -1)
}

export const mustachesVarDefn: VariableDefn = {
    regex: /(\{\{[^}]*\}\})/g,
    removeStartEnd: s => s.slice(2, -2)
}

export const colonPrefixedVarDefn: VariableDefn = {
    regex: /(:[a-zA-Z0-9._]+)/g,
    removeStartEnd: s => s.slice(1)
}

export const doubleAngleVarDefn: VariableDefn = {
    regex: /(<<[^>]*>>)/g,
    removeStartEnd: s => s.slice(2, -2)
}
export type RenderOptions<T> = {
    onMissing?: 'error' | 'warning' | 'empty' | 'keep'
    functions?: Record<string, TemplateFunction<T>>
    variableDefn?: VariableDefn
}

export type TemplateFunction<T> = (args: {
    value: unknown
    context: T
    params: string[]
}) => unknown

export type TemplateIssue = {
    path: string[]
    message: string
    severity: 'warning' | 'error'
    expression?: string
}

export type RenderResult = {
    text: string
    warnings: TemplateIssue[]
    errors: TemplateIssue[]
}

export type TemplateEngine =
    <T>(template: Template<T> | string, context: T, options?: RenderOptions<T>) => RenderResult