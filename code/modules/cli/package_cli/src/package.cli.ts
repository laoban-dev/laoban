import {CliGroup, defineCommand, group} from "@laoban/clidsl";
import {ErrorsOr, flatMapErrorsOr, flatMapErrorsOrK, mapErrorsOr} from "@laoban/errors";
import {
    LoadedLaobanProject,
    LoadedPackageDetail,
    loadPackages,
    NormalisedPackageDetails
} from "@laoban/package_details";
import {LaobanConfigCliContext, loadConfig} from "@laoban/config_cli";
import {LoadedLaobanConfig} from "@laoban/laoban_config";
import {mapObject, prettyRecordJson} from "@laoban/records";
import {packageDetailsGraph, topologicallySortPackageDetails} from "@laoban/package_details/src/package.details.sort";
import {prettyPrintGenerationsSwimlanes, prettyPrintGenerationsVertical} from "@laoban/topologicalsort";

export type LaobanDebugContext = "cli";

export type LoadConfigFn =
    (context: LaobanConfigCliContext) => Promise<ErrorsOr<LoadedLaobanConfig>>

export type LoadPackagesFn =
    (loaded: LoadedLaobanConfig, context: LaobanConfigCliContext) => Promise<ErrorsOr<LoadedLaobanProject>>

export type LoadConfigAndPackagesFn =
    (context: LaobanPackageCliContext) => Promise<ErrorsOr<LoadedLaobanProject>>

export type LaobanPackageCliContext = LaobanConfigCliContext & {
    loadConfigFn: LoadConfigFn
    loadPackagesFn: LoadPackagesFn
    loadConfigAndPackagesFn: LoadConfigAndPackagesFn
}

export async function loadConfigAndPackages(
    context: LaobanPackageCliContext,
): Promise<ErrorsOr<LoadedLaobanProject>> {
    return flatMapErrorsOrK(
        await context.loadConfigFn(context),
        loaded => context.loadPackagesFn(loaded, context),
    );
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

export async function loadSortedLaobanProject(
    context: LaobanPackageCliContext,
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

const packageListCommand = defineCommand<{}, LaobanPackageCliContext>()({
    description: "List packages",
    positionals: {},
    options: {},
    execute: async (_values, context) =>
        mapErrorsOr(
            await context.loadConfigAndPackagesFn(context),
            loaded =>
                context.observability.log(
                    prettyRecordJson(
                        mapObject(
                            loaded.loadedPackageDetails,
                            detail => detail.packageFile,
                        ),
                    ),
                ),
        ),
});

const packageViewCommand = defineCommand<{ name: string }, LaobanPackageCliContext>()({
    description: "View one package.details.json",
    positionals: {
        name: {
            description: "Package name",
            type: "string",
            required: true
        }
    },
    options: {},
    execute: async (values, context) => {
        context.observability.log("package view", values.name);
        return {};
    },
});

const packageSortCommand = defineCommand<{ horizontal: boolean }, LaobanPackageCliContext>()({
    description: "Show packages in topological order",
    positionals: {},
    options: {
        horizontal: {
            shortName: "h",
            description: "Show generations horizontally (swimlanes) instead of vertically",
            type: "boolean",
            required: false,
            defaultValue: false
        }
    },
    execute: async ({horizontal}, context) => {
        const print = horizontal ? prettyPrintGenerationsSwimlanes : prettyPrintGenerationsVertical

        return mapErrorsOr(
            await loadSortedLaobanProject(context),
            sorted =>
                context.observability.log(
                    "\n" + print(sorted.generations, packageDetailsGraph),
                ),
        );
    }
});

export const laobanPackageCommands: CliGroup<LaobanPackageCliContext> =
    group("Package commands", {
        list: packageListCommand,
        view: packageViewCommand,
        sort: packageSortCommand,
    })