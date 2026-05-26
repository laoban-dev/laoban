import * as path from "node:path"
import {BaseIssue, Errors, warnings} from "@laoban/errors"
import {Observability} from "@laoban/observability"

export type DumpLaobanErrors = (
    observability: Observability,
    errors: Errors<BaseIssue>,
) => void

type CliIssueRenderOptions = Readonly<{
    rootDirectory?: string
}>

type DiagnosticContext = Readonly<{
    currentFile?: string
    loadPath?: string[]
}>

type IssueWithDiagnosticContext = BaseIssue & Readonly<{
    diagnosticContext: DiagnosticContext
}>

type GroupedDiagnosticIssue = Readonly<{
    context: string
    issues: IssueWithDiagnosticContext[]
}>

type GroupedFileIssues = Readonly<{
    file: string
    generalIssues: IssueWithDiagnosticContext[]
    contextGroups: GroupedDiagnosticIssue[]
}>

function normaliseSlashes(s: string): string {
    return s.replace(/\\/g, "/")
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function diagnosticContextOf(issue: BaseIssue): DiagnosticContext | undefined {
    const diagnosticContext = (issue as {diagnosticContext?: unknown}).diagnosticContext

    if (!isRecord(diagnosticContext))
        return undefined

    const currentFile =
        typeof diagnosticContext.currentFile === "string"
            ? diagnosticContext.currentFile
            : undefined

    const loadPath =
        Array.isArray(diagnosticContext.loadPath)
            ? diagnosticContext.loadPath.filter((entry): entry is string => typeof entry === "string")
            : undefined

    if (currentFile === undefined && loadPath === undefined)
        return undefined

    return {
        currentFile,
        loadPath,
    }
}

function issueCurrentFile(issue: IssueWithDiagnosticContext): string {
    return issue.diagnosticContext.currentFile ?? "<unknown file>"
}

function renderFileName(
    filename: string,
    options: CliIssueRenderOptions,
): string {
    const normalisedFilename = normaliseSlashes(filename)

    if (options.rootDirectory === undefined)
        return normalisedFilename

    const normalisedRoot = normaliseSlashes(options.rootDirectory)
    const relative = normaliseSlashes(path.relative(normalisedRoot, normalisedFilename))

    if (relative.length === 0)
        return "."

    if (relative.startsWith(".."))
        return normalisedFilename

    return relative
}

function isArrayIndex(part: string): boolean {
    return /^\d+$/.test(part)
}

export function renderIssueContext(context: unknown): string {
    if (!Array.isArray(context))
        return ""

    const parts = context.map(String)

    if (parts.length === 0)
        return ""

    return parts.reduce((rendered, part, index) => {
        if (index === 0)
            return part

        if (isArrayIndex(part))
            return `${rendered}[${part}]`

        return `${rendered}.${part}`
    }, "")
}

function issueContextKey(issue: BaseIssue): string {
    return renderIssueContext(issue.context)
}

function issueCode(issue: BaseIssue): string | undefined {
    return typeof issue.code === "string" && issue.code.length > 0
        ? issue.code
        : undefined
}

function issueKind(issue: BaseIssue): string | undefined {
    return issue.kind === undefined
        ? undefined
        : String(issue.kind)
}

function renderDiagnosticIssueLine(issue: BaseIssue): string {
    const code = issueCode(issue)

    if (code !== undefined)
        return `${code}: ${issue.message}`

    const kind = issueKind(issue)

    if (kind !== undefined)
        return `${kind}: ${issue.message}`

    return issue.message
}

function groupBy<T>(
    values: T[],
    keyOf: (value: T) => string,
): Record<string, T[]> {
    return values.reduce<Record<string, T[]>>((acc, value) => {
        const key = keyOf(value)
        acc[key] = [...(acc[key] ?? []), value]
        return acc
    }, {})
}

function toGroupedFileIssues(
    issues: IssueWithDiagnosticContext[],
    options: CliIssueRenderOptions,
): GroupedFileIssues[] {
    const byFile = groupBy(
        issues,
        issue => renderFileName(issueCurrentFile(issue), options),
    )

    return Object.entries(byFile).map(([file, fileIssues]) => {
        const generalIssues: IssueWithDiagnosticContext[] = []
        const contextualIssues: IssueWithDiagnosticContext[] = []

        for (const issue of fileIssues) {
            if (issueContextKey(issue).length === 0)
                generalIssues.push(issue)
            else
                contextualIssues.push(issue)
        }

        const byContext = groupBy(
            contextualIssues,
            issue => issueContextKey(issue),
        )

        return {
            file,
            generalIssues,
            contextGroups: Object.entries(byContext).map(([context, contextIssues]) => ({
                context,
                issues: contextIssues,
            })),
        }
    })
}

function renderGeneralIssues(
    issues: IssueWithDiagnosticContext[],
): string[] {
    return issues.map(issue =>
        `  ${renderDiagnosticIssueLine(issue)}`,
    )
}

function renderContextGroup(group: GroupedDiagnosticIssue): string {
    return [
        `  ${group.context}`,
        ...group.issues.map(issue =>
            `    ${renderDiagnosticIssueLine(issue)}`,
        ),
    ].join("\n")
}

function renderGroupedFileIssues(fileIssues: GroupedFileIssues): string {
    const hasGeneralIssues = fileIssues.generalIssues.length > 0
    const hasContextGroups = fileIssues.contextGroups.length > 0

    return [
        `in file ${fileIssues.file}`,
        ...renderGeneralIssues(fileIssues.generalIssues),
        hasGeneralIssues && hasContextGroups ? "" : undefined,
        ...fileIssues.contextGroups.map(renderContextGroup),
    ]
        .filter((line): line is string => line !== undefined)
        .join("\n")
}

function renderDiagnosticIssues(
    issues: IssueWithDiagnosticContext[],
    options: CliIssueRenderOptions,
): string {
    if (issues.length === 0)
        return ""

    return toGroupedFileIssues(issues, options)
        .map(renderGroupedFileIssues)
        .join("\n\n")
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2)
    } catch (e) {
        return JSON.stringify({
            message: "Could not render issue as JSON",
            error: String(e),
        }, null, 2)
    }
}

function indent(text: string, prefix: string): string {
    return text
        .split("\n")
        .map(line => `${prefix}${line}`)
        .join("\n")
}

function renderJsonIssue(issue: BaseIssue, index: number): string {
    return [
        `  ${index + 1}.`,
        indent(safeJson(issue), "    "),
    ].join("\n")
}

function renderDuplicatePackageNameIssue(
    issue: BaseIssue,
    options: CliIssueRenderOptions,
): string | undefined {
    if (issue.kind !== "duplicatePackageName")
        return undefined

    if (!isRecord(issue.context))
        return undefined

    const packageName = issue.context.packageName
    const packageFiles = issue.context.packageFiles

    if (typeof packageName !== "string")
        return undefined

    if (!Array.isArray(packageFiles))
        return undefined

    const files = packageFiles
        .filter((file): file is string => typeof file === "string")
        .map(file => renderFileName(file, options))

    return [
        `Duplicate package name: ${packageName}, found in:`,
        ...files.map(file => `  ${file}`),
    ].join("\n")
}

function renderKnownOtherIssue(
    issue: BaseIssue,
    options: CliIssueRenderOptions,
): string | undefined {
    return renderDuplicatePackageNameIssue(issue, options)
}

function renderOtherIssue(
    issue: BaseIssue,
    index: number,
    options: CliIssueRenderOptions,
): string {
    return renderKnownOtherIssue(issue, options)
        ?? renderJsonIssue(issue, index)
}

function renderOtherIssues(
    title: string,
    issues: BaseIssue[],
    options: CliIssueRenderOptions,
): string {
    if (issues.length === 0)
        return ""

    return [
        title,
        "",
        ...issues.map((issue, index) =>
            renderOtherIssue(issue, index, options),
        ),
    ].join("\n")
}

function splitDiagnosticIssues(issues: BaseIssue[]): {
    diagnosticIssues: IssueWithDiagnosticContext[]
    otherIssues: BaseIssue[]
} {
    const diagnosticIssues: IssueWithDiagnosticContext[] = []
    const otherIssues: BaseIssue[] = []

    for (const issue of issues) {
        const diagnosticContext = diagnosticContextOf(issue)

        if (typeof diagnosticContext?.currentFile === "string") {
            diagnosticIssues.push({
                ...issue,
                diagnosticContext,
            })
        } else {
            otherIssues.push(issue)
        }
    }

    return {
        diagnosticIssues,
        otherIssues,
    }
}

export function renderIssueSection(
    title: string,
    otherTitle: string,
    issues: BaseIssue[],
    options: CliIssueRenderOptions = {},
): string {
    if (issues.length === 0)
        return ""

    const {
        diagnosticIssues,
        otherIssues,
    } = splitDiagnosticIssues(issues)

    const diagnosticRendered = renderDiagnosticIssues(diagnosticIssues, options)
    const otherRendered = renderOtherIssues(otherTitle, otherIssues, options)

    const body = [
        diagnosticRendered,
        otherRendered,
    ]
        .filter(section => section.length > 0)
        .join("\n\n")

    if (body.length === 0)
        return ""

    return [
        title,
        "",
        body,
    ].join("\n")
}

export function renderIssueReport(
    warningIssues: BaseIssue[],
    errorIssues: BaseIssue[],
    options: CliIssueRenderOptions = {},
): string {
    const rendered = [
        renderIssueSection("Warnings", "Other warnings", warningIssues, options),
        renderIssueSection("Errors", "Other errors", errorIssues, options),
    ]
        .filter(section => section.length > 0)
        .join("\n\n")

    return rendered.length === 0
        ? ""
        : `${rendered}\n`
}

export function makeDumpLaobanErrors(rootDirectory: string): DumpLaobanErrors {
    return (observability, errorObject) => {
        observability.write(renderIssueReport(
            warnings(errorObject),
            errorObject.errors,
            {
                rootDirectory,
            },
        ))
    }
}