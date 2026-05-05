import {BasicCliContext, defineCommand} from "@laoban/clidsl"
import {mapErrorsOr} from "@laoban/errors"
import {planManagedFiles, PlanManagedFilesConfig} from "@laoban/update/src/plan.file.operations";
import {updateManagedFiles, UpdateManagedFilesConfig} from "@laoban/update/src/update.file.operations";
import {LaobanUpdateRunnerConfig} from "@laoban/update";
import {LoadNormalisedTemplateConfig} from "@laoban/template_files";


export type LaobanUpdateConfig =
    PlanManagedFilesConfig &
    UpdateManagedFilesConfig &
    LoadNormalisedTemplateConfig &
    LaobanUpdateRunnerConfig

export type LaobanUpdateCliContext =
    BasicCliContext &
    LaobanUpdateConfig

export function makeLaobanUpdateCommand<C extends LaobanUpdateCliContext>() {
    return defineCommand<{
        debug: boolean
        dryRun: boolean
        throttle: number
    }, C>()({
        description: "Update managed files from templates",
        positionals: {},
        options: {
            debug: {
                description: "Write generated file names and contents to output",
                type: "boolean",
                required: false,
                defaultValue: false,
            },
            dryRun: {
                description: "Show generated file names and contents without writing files",
                type: "boolean",
                required: false,
                defaultValue: false,
            },
            throttle: {
                shortName: "t",
                description: "Number of packages to process at once",
                type: "number",
                required: false,
                defaultValue: 5,
            },
        },
        execute: async ({debug, dryRun, throttle}, context) => {
            context.observability.log(
                dryRun
                    ? "Planning managed file update in dry-run mode"
                    : "Updating managed files from templates",
            )

            return mapErrorsOr(
                await context.planManagedFiles(
                    {
                        ...context,
                        throttle,
                        consumeBatch: ({files}) =>
                            context.updateManagedFiles(
                                {
                                    ...context,
                                    debug,
                                    dryRun,
                                },
                                files,
                            ),
                    },
                    context.start,
                ),
                result =>
                    context.observability.log(
                        `Managed file update complete: batches=${result.batches}, packages=${result.packages}, files=${result.files}`,
                    ),
            )
        },
    })
}

export const laobanUpdateCommand = makeLaobanUpdateCommand<LaobanUpdateCliContext>()

export function defaultLaobanUpdateConfig(
    config: Omit<LaobanUpdateConfig, "planManagedFiles" | "updateManagedFiles">,
): LaobanUpdateConfig {
    return {
        ...config,
        planManagedFiles,
        updateManagedFiles,
    }
}