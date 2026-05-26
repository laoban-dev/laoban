import * as path from "node:path"
import {findMax} from "@laoban/arrays"
import {CliGroup, defineCommand, group} from "@laoban/clidsl"
import {
    BaseIssue,
    ErrorsOr,
    flatMapErrorsOr,
    flatMapErrorsOrK,
    isErrors,
    mapErrorsOr,
    value,
} from "@laoban/errors"
import {
    ChannelsState,
    flushAllTouchedChannels,
    ModuleObservability,
    ModuleObservabilityScope,
    Observability,
} from "@laoban/observability"
import {
    GenerationWalkSummary,
    GenerationalWalkConfig,
    GenerationalWalkVisitor,
    generationalWalk,
} from "@laoban/generational_reporter"
import {
    LoadedLaobanProject,
    LoadedPackageDetail,
    NormalisedPackageDetails,
    packageDetailsGraph,
    topologicallySortPackageDetails,
} from "@laoban/package_details"
import {LaobanConfigCliContext} from "@laoban/config_cli"
import {LoadedLaobanConfig} from "@laoban/laoban_config"
import {mapObject} from "@laoban/records"
import {
    prettyPrintGenerationsSwimlanes,
    prettyPrintGenerationsVertical,
    ThrottlePlanFn,
} from "@laoban/topologicalsort"

export type LaobanDebugContext = "cli"

export type LaobanPackageChannelPurpose = ".log" | ".session"

export type LoadConfigFn =
    (context: LaobanConfigCliContext) => Promise<ErrorsOr<LoadedLaobanConfig>>

export type LoadPackagesFn =
    (loaded: LoadedLaobanConfig, context: LaobanConfigCliContext) => Promise<ErrorsOr<LoadedLaobanProject>>

export type LoadConfigAndPackagesFn<ReadChannel, WriteChannel, Ref> =
    (context: LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>) => Promise<ErrorsOr<LoadedLaobanProject>>

export type LaobanPackageCliContext<ReadChannel, WriteChannel, Ref> =
    LaobanConfigCliContext & {
    loadConfigFn: LoadConfigFn
    loadPackagesFn: LoadPackagesFn
    loadConfigAndPackagesFn: LoadConfigAndPackagesFn<ReadChannel, WriteChannel, Ref>

    channelsState: ChannelsState<
        LaobanPackageChannelPurpose,
        ReadChannel,
        WriteChannel,
        Ref
    >

    stdOut: WriteChannel

    throttle: number
    throttlePlan: ThrottlePlanFn<LoadedPackageDetail>
}

export async function loadConfigAndPackages<ReadChannel, WriteChannel, Ref>(
    context: LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>,
): Promise<ErrorsOr<LoadedLaobanProject>> {
    return flatMapErrorsOrK(
        await context.loadConfigFn(context),
        loaded => context.loadPackagesFn(loaded, context),
    )
}

export type SortedLaobanProject = {
    loaded: LoadedLaobanProject
    generations: NormalisedPackageDetails[][]
}

export function makeNameToNormalisedPackageDetails(
    inp: Record<string, LoadedPackageDetail>,
): Record<string, NormalisedPackageDetails> {
    return mapObject(inp, detail => detail.contents)
}

export async function loadSortedLaobanProject<ReadChannel, WriteChannel, Ref>(
    context: LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>,
): Promise<ErrorsOr<SortedLaobanProject>> {
    return flatMapErrorsOr(
        await context.loadConfigAndPackagesFn(context),
        loaded =>
            mapErrorsOr(
                topologicallySortPackageDetails(
                    makeNameToNormalisedPackageDetails(loaded.loadedPackageDetails),
                    {purpose: "sortLaobanProject", observability: context.observability},
                ),
                generations => ({loaded, generations}),
            ),
    )
}

function normaliseSlashes(s: string): string {
    return s.replace(/\\/g, "/")
}

function packageDirectoryFromPackageDetailsFile(packageDetailsFile: string): string {
    return normaliseSlashes(packageDetailsFile)
        .replace(/\/package\.details\.json$/, "")
}

function laobanProjectRoot(loaded: LoadedLaobanProject): string {
    return normaliseSlashes(loaded.loadedLaobanConfig.configDirectory)
}

function relativePackageDirectory(
    loaded: LoadedLaobanProject,
    detail: LoadedPackageDetail,
): string {
    const root = laobanProjectRoot(loaded)
    const packageDirectory = packageDirectoryFromPackageDetailsFile(detail.packageFile)

    return normaliseSlashes(path.relative(root, packageDirectory))
}

function packageModuleName(detail: LoadedPackageDetail): string {
    return detail.contents.name
}

function packageModuleScope(detail: LoadedPackageDetail): ModuleObservabilityScope {
    return {
        module: packageModuleName(detail),
        directory: packageDirectoryFromPackageDetailsFile(detail.packageFile),
    }
}

type PackageListRow = Readonly<{
    directory: string
    name: string
    template: string
}>

type PackageListFormat = Readonly<{
    directoryWidth: number
    nameWidth: number
    templateWidth: number
}>

type GenerationErrorSummary = Readonly<{
    generationIndex: number
    errorCount: number
}>

function packageListRow(
    loaded: LoadedLaobanProject,
    detail: LoadedPackageDetail,
): PackageListRow {
    return {
        directory: relativePackageDirectory(loaded, detail),
        name: detail.contents.name ?? "<unnamed>",
        template: detail.contents.template ?? "<no template>",
    }
}

function packageListRows(loaded: LoadedLaobanProject): PackageListRow[] {
    return Object.values(loaded.loadedPackageDetails)
        .map(packageDetail => packageListRow(loaded, packageDetail))
}

function packageListFormat(rows: PackageListRow[]): PackageListFormat {
    return {
        directoryWidth: Math.max("Directory".length, findMax(rows, row => row.directory.length)),
        nameWidth: Math.max("Name".length, findMax(rows, row => row.name.length)),
        templateWidth: Math.max("Template".length, findMax(rows, row => row.template.length)),
    }
}

function packageListFormatForLoadedProject(
    loaded: LoadedLaobanProject,
): PackageListFormat {
    return packageListFormat(packageListRows(loaded))
}

function renderPackageListRow(
    row: PackageListRow,
    format: PackageListFormat,
): string {
    return [
        row.directory.padEnd(format.directoryWidth),
        row.name.padEnd(format.nameWidth),
        row.template.padEnd(format.templateWidth),
    ].join("  ").trimEnd()
}

function renderPackageListHeader(format: PackageListFormat): string {
    const heading = [
        "Directory".padEnd(format.directoryWidth),
        "Name".padEnd(format.nameWidth),
        "Template".padEnd(format.templateWidth),
    ].join("  ").trimEnd()

    const separator = [
        "-".repeat(format.directoryWidth),
        "-".repeat(format.nameWidth),
        "-".repeat(format.templateWidth),
    ].join("  ").trimEnd()

    return `${heading}\n${separator}\n`
}

function renderPackageCount(summary: GenerationWalkSummary): string {
    if (summary.visitedItemCount === summary.plannedItemCount)
        return String(summary.visitedItemCount)

    return `${summary.visitedItemCount}/${summary.plannedItemCount}`
}

function renderPackageListSummary(summary: GenerationWalkSummary): string {
    return [
        "",
        "Summary",
        `  packages:    ${renderPackageCount(summary)}`,
        `  generations: ${summary.generationCount}`,
        summary.warningCount > 0 ? `  warnings:    ${summary.warningCount}` : undefined,
        summary.errorCount > 0 ? `  errors:      ${summary.errorCount}` : undefined,
        summary.stoppedEarly ? "  stopped:     yes" : undefined,
    ]
        .filter((line): line is string => line !== undefined)
        .join("\n") + "\n"
}

function renderGenerationErrorSummaries(
    generationErrors: GenerationErrorSummary[],
): string {
    if (generationErrors.length === 0)
        return ""

    return [
        "",
        "Generation errors",
        ...generationErrors.map(summary =>
            `  generation ${summary.generationIndex + 1}: ${summary.errorCount} error${summary.errorCount === 1 ? "" : "s"}`,
        ),
    ].join("\n") + "\n"
}

function renderIssue(issue: BaseIssue): string {
    const parts = [
        issue.severity ? `[${issue.severity}]` : undefined,
        issue.kind === undefined ? undefined : String(issue.kind),
        issue.code === undefined ? undefined : `(${issue.code})`,
        issue.message,
    ].filter((part): part is string => part !== undefined)

    const lines = [
        `  ${parts.join(" ")}`,
    ]

    if (issue.context !== undefined)
        lines.push(`    context: ${JSON.stringify(issue.context)}`)

    return lines.join("\n")
}

function renderIssuesSection(title: string, issues: BaseIssue[]): string {
    if (issues.length === 0)
        return ""

    return [
        "",
        title,
        ...issues.map(renderIssue),
    ].join("\n")
}

function renderPackageListFinalIssues(
    warnings: BaseIssue[],
    errors: BaseIssue[],
): string {
    const rendered = [
        renderIssuesSection("Warnings", warnings),
        renderIssuesSection("Errors", errors),
    ]
        .filter(section => section.length > 0)
        .join("\n")

    return rendered.length === 0 ? "" : rendered + "\n"
}

function packageListReportVisitor<WriteChannel>(
    format: PackageListFormat,
): GenerationalWalkVisitor<
    LoadedLaobanProject,
    LoadedPackageDetail,
    WriteChannel
> {
    const generationErrors: GenerationErrorSummary[] = []

    const visit = async (
        loaded: LoadedLaobanProject,
        detail: LoadedPackageDetail,
        observability: ModuleObservability<WriteChannel>,
    ): Promise<ErrorsOr<unknown>> => {
        observability.write(
            renderPackageListRow(packageListRow(loaded, detail), format) + "\n",
        )

        return value(undefined)
    }

    const displayGenerationErrors = async (
        _loaded: LoadedLaobanProject,
        generationIndex: number,
        _generation: LoadedPackageDetail[],
        errors: BaseIssue[],
        _observability: Observability,
    ): Promise<ErrorsOr<unknown>> => {
        generationErrors.push({
            generationIndex,
            errorCount: errors.length,
        })

        return value(undefined)
    }

    const displaySummary = async (
        _loaded: LoadedLaobanProject,
        summary: GenerationWalkSummary,
        observability: Observability,
    ): Promise<ErrorsOr<unknown>> => {
        const generationErrorSummary = renderGenerationErrorSummaries(generationErrors)

        if (generationErrorSummary.length > 0)
            observability.write(generationErrorSummary)

        observability.write(renderPackageListSummary(summary))

        return value(undefined)
    }

    const displayFinalIssues = async (
        _loaded: LoadedLaobanProject,
        warnings: BaseIssue[],
        errors: BaseIssue[],
        observability: Observability,
    ): Promise<ErrorsOr<unknown>> => {
        observability.write(renderPackageListFinalIssues(warnings, errors))
        return value(undefined)
    }

    return {
        visit,
        displayGenerationErrors,
        displaySummary,
        displayFinalIssues,
    }
}

function packageListWalkConfig<ReadChannel, WriteChannel, Ref>(
    context: LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>,
    loaded: LoadedLaobanProject,
): GenerationalWalkConfig<
    LoadedLaobanProject,
    LoadedPackageDetail,
    LaobanPackageChannelPurpose,
    ReadChannel,
    WriteChannel,
    Ref
> {
    return {
        observability: context.observability,
        channelsState: context.channelsState,

        load: async () =>
            value(loaded),

        toGenerations: loadedProject => {
            const details = Object.values(loadedProject.loadedPackageDetails)
                .sort((a, b) =>
                    relativePackageDirectory(loadedProject, a)
                        .localeCompare(relativePackageDirectory(loadedProject, b)),
                )

            return value(
                context.throttlePlan(
                    [details],
                    context.throttle,
                ),
            )
        },

        toModuleScope: (_loaded, detail) =>
            packageModuleScope(detail),

        flush: out =>
            flushAllTouchedChannels(context.channelsState)(out),

        continueOnGenerationError: true,
    }
}

async function runPackageListReport<ReadChannel, WriteChannel, Ref>(
    context: LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>,
): Promise<ErrorsOr<unknown>> {
    const loaded = await context.loadConfigAndPackagesFn(context)

    if (isErrors(loaded))
        return loaded

    const format = packageListFormatForLoadedProject(loaded.value)

    context.observability.write(renderPackageListHeader(format))

    return generationalWalk(
        packageListWalkConfig(context, loaded.value),
        packageListReportVisitor(format),
        context.stdOut,
    )
}

const packageListCommand = <ReadChannel, WriteChannel, Ref>() =>
    defineCommand<{}, LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>>()({
        description: "List packages",
        positionals: {},
        options: {},
        execute: async (_values, context) =>
            runPackageListReport(context),
    })

const packageViewCommand = <ReadChannel, WriteChannel, Ref>() =>
    defineCommand<{name: string}, LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>>()({
        description: "View one package.details.json",
        positionals: {
            name: {
                description: "Package name",
                type: "string",
                required: true,
            },
        },
        options: {},
        execute: async (values, context) => {
            context.observability.write(`package view ${values.name}\n`)
            return value(undefined)
        },
    })

const packageSortCommand = <ReadChannel, WriteChannel, Ref>() =>
    defineCommand<{horizontal: boolean}, LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>>()({
        description: "Show packages in topological order",
        positionals: {},
        options: {
            horizontal: {
                shortName: "h",
                description: "Show generations horizontally (swimlanes) instead of vertically",
                type: "boolean",
                required: false,
                defaultValue: false,
            },
        },
        execute: async ({horizontal}, context) => {
            const print = horizontal ? prettyPrintGenerationsSwimlanes : prettyPrintGenerationsVertical

            return mapErrorsOr(
                await loadSortedLaobanProject(context),
                sorted =>
                    context.observability.write(
                        "\n" + print(sorted.generations, packageDetailsGraph) + "\n",
                    ),
            )
        },
    })

export function laobanPackageCommands<ReadChannel, WriteChannel, Ref>(): CliGroup<
    LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>
> {
    return group("Package commands", {
        list: packageListCommand<ReadChannel, WriteChannel, Ref>(),
        view: packageViewCommand<ReadChannel, WriteChannel, Ref>(),
        sort: packageSortCommand<ReadChannel, WriteChannel, Ref>(),
    })
}