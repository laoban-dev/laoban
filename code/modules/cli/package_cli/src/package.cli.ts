import {CliGroup, defineCommand, group} from "@laoban/clidsl"
import {
    ErrorsOr,
    flatMapErrorsOr,
    flatMapErrorsOrK,
    mapErrorsOr,
    value,
} from "@laoban/errors"
import {
    ChannelsState,
    flushAllTouchedChannels,
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

    /**
     * Runtime stdout channel.
     *
     * In the Node adapter this will normally be process.stdout, represented as
     * the runtime WriteChannel. This layer remains generic and does not know
     * Node streams directly.
     */
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

function packageDirectoryFromPackageFile(packageFile: string): string {
    return packageFile
        .replace(/\\/g, "/")
        .replace(/\/package\.details\.json$/, "")
}

function packageModuleName(detail: LoadedPackageDetail) {
    return detail.contents.name
}

function packageModuleScope(detail: LoadedPackageDetail): ModuleObservabilityScope {
    return {
        module: packageModuleName(detail),
        directory: packageDirectoryFromPackageFile(detail.packageFile),
    }
}

function packageListLine(detail: LoadedPackageDetail): string {
    return [
        packageDirectoryFromPackageFile(detail.packageFile),
        detail.contents.name ?? "",
        detail.contents.template ?? "",
    ].join("\t")
}

async function runPackageListReport<ReadChannel, WriteChannel, Ref>(
    context: LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>,
): Promise<ErrorsOr<unknown>> {
    const visitor: GenerationalWalkVisitor<
        LoadedLaobanProject,
        LoadedPackageDetail,
        WriteChannel
    > = {
        visit: async (_loaded, detail, observability) => {
            observability.log(packageListLine(detail))
            return value(undefined)
        },

        displaySummary: async (
            _loaded: LoadedLaobanProject,
            summary: GenerationWalkSummary,
            observability: Observability,
        ) => {
            observability.log(
                `packages: ${summary.visitedItemCount}/${summary.plannedItemCount}`,
            )
            return value(undefined)
        },
    }

    const config: GenerationalWalkConfig<
        LoadedLaobanProject,
        LoadedPackageDetail,
        LaobanPackageChannelPurpose,
        ReadChannel,
        WriteChannel,
        Ref
    > = {
        observability: context.observability,
        channelsState: context.channelsState,

        load: () =>
            context.loadConfigAndPackagesFn(context),

        toGenerations: loaded => {
            const details = Object.values(loaded.loadedPackageDetails)

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

    return generationalWalk(config, visitor, context.stdOut)
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
    defineCommand<{ name: string }, LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>>()({
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
            context.observability.log("package view", values.name)
            return value(undefined)
        },
    })

const packageSortCommand = <ReadChannel, WriteChannel, Ref>() =>
    defineCommand<{ horizontal: boolean }, LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>>()({
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
                    context.observability.log(
                        "\n" + print(sorted.generations, packageDetailsGraph),
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