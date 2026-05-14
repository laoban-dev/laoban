import {
    BaseIssue,
    errors,
    ErrorsOr,
    flatMapBaseIssueK,
    isErrors,
    value,
} from "@laoban/errors"
import {ExecutionPlanStats, prettyPrintExecutionPlan} from "@laoban/execution_plan"
import {
    flushAllTouchedChannels,
    ModuleName,
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
    LaobanPackageChannelPurpose,
} from "@laoban/package_cli"
import {LoadedLaobanProject, LoadedPackageDetail} from "@laoban/package_details"
import {LaobanScript, ScriptName} from "@laoban/scripts"
import {
    makeScriptExecutionPlan,
    ScriptExecutionItem,
    scriptExecutionPlanPrettyPrintTypeClass,
} from "@laoban/script_plan"
import {detemplateScriptExecutionPlan} from "./resolve.templates"
import {safePrettyJson} from "@laoban/safe"
import {filterExecutionPlan} from "./filter.packages"
import {DirectoryName} from "@laoban/execution"
import {LaobanScriptCliContext, ScriptCommandValues} from "./script.context"

export type LaobanScriptExecutionContext<
    ReadChannel,
    WriteChannel,
    Ref,
    ExecutorName extends string = string,
> =
    LaobanScriptCliContext<ReadChannel, WriteChannel, Ref, ExecutorName>

type ScriptExecutionInput = Readonly<{
    loadedProject: LoadedLaobanProject
    fullPlan: ScriptExecutionItem[][]
}>

function logPlan(
    scriptName: ScriptName,
    plan: ScriptExecutionItem[][],
    stats: ExecutionPlanStats<LoadedPackageDetail>,
    {log}: Observability,
): void {
    log(`Plan for script: ${scriptName}`)
    log("\n" + prettyPrintExecutionPlan(plan, scriptExecutionPlanPrettyPrintTypeClass))
    log("Stats")
    log(`  commandCount: ${stats.commandCount}`)
    log(`  distinctPackageDetails: ${stats.distinctPackageDetails.length}`)
    log(`  executionItemCount: ${stats.executionItemCount}`)
    log(`  packageExecutionItemCount: ${stats.packageExecutionItemCount}`)
    log(`  barrierCount: ${stats.barrierCount}`)
    log(`  generationCount: ${stats.generationCount}`)
    log(`  largestGenerationSize: ${stats.largestGenerationSize}`)
}

function packageNameOf(item: ScriptExecutionItem): string {
    return item.kind === "oncePerWorkSpace"
        ? "workspace"
        : item.pkg!.contents.name
}

function prettyPrintPlanWithRhs<G>(
    plan: G[][],
    nameOf: (g: G) => string,
    rhsOf: (g: G) => string,
    linePrefix: string = "Package: ",
): string {
    const maxNameWidth = plan.reduce(
        (max, generation) => Math.max(
            max,
            0,
            ...generation.map(item => nameOf(item).length),
        ),
        0,
    )

    return plan
        .reduce(
            (acc: string[], generation: G[]) =>
                acc.concat(
                    generation.map((item: G) =>
                        `${linePrefix}${nameOf(item).padEnd(maxNameWidth)} ${rhsOf(item)}`,
                    ),
                ),
            [],
        )
        .join("\n")
}

function logVariables<
    ReadChannel,
    WriteChannel,
    Ref,
    ExecutorName extends string = string,
>(
    loadedProject: LoadedLaobanProject,
    fullPlan: ScriptExecutionItem[][],
    context: LaobanScriptExecutionContext<ReadChannel, WriteChannel, Ref, ExecutorName>,
): void {
    context.observability.log(prettyPrintPlanWithRhs(fullPlan, packageNameOf, item => {
        const dictionary = context.makeDictionary(item, loadedProject)
        return safePrettyJson(dictionary)
    }))
}

function executionDirectoryOf(item: ScriptExecutionItem): DirectoryName {
    const result = item.pkg!.dir

    if (!result)
        throw new Error(`Script execution item has no command directory: ${item.command.command}`)

    return result
}

function moduleScopeOf(item: ScriptExecutionItem): ModuleObservabilityScope {
    return {
        module: item.pkg!.contents.name,
        directory: item.pkg!.dir,
    }
}

function commandFailedIssue(
    scriptName: ScriptName,
    moduleName: ModuleName,
    item: ScriptExecutionItem,
    cwd: DirectoryName,
    exitCode: number,
): ErrorsOr<never, BaseIssue> {
    return errors({
        kind: "commandFailed",
        message: `Command failed with exit code ${exitCode}`,
        context: {
            scriptName,
            moduleName,
            stepIndex: item.stepIndex,
            command: item.command.command,
            cwd,
            exitCode,
        },
    })
}

async function executeOneScriptItem<
    ReadChannel,
    WriteChannel,
    Ref,
    ExecutorName extends string = string,
>(
    context: LaobanScriptExecutionContext<ReadChannel, WriteChannel, Ref, ExecutorName>,
    scriptName: ScriptName,
    options: ScriptCommandValues,
    item: ScriptExecutionItem,
    observability: ModuleObservability<WriteChannel>,
): Promise<ErrorsOr<number, BaseIssue>> {
    const moduleScope = moduleScopeOf(item)
    const moduleName = moduleScope.module
    const cwd = executionDirectoryOf(item)

    const result = await context.execution.execute({
        command: item.command.command,
        cwd,
        env: context.env,
        writable: observability.writable,
        observability,
        config: context.execution.config,
        dryRun: options.dryrun,
        title: options.shellDebug,
    })

    if (isErrors(result)) return result
    if (result.value === 0) return result

    return commandFailedIssue(
        scriptName,
        moduleName,
        item,
        cwd,
        result.value,
    )
}

async function executeScript<
    ReadChannel,
    WriteChannel,
    Ref,
    ExecutorName extends string = string,
>(
    context: LaobanScriptExecutionContext<ReadChannel, WriteChannel, Ref, ExecutorName>,
    scriptName: ScriptName,
    options: ScriptCommandValues,
    loadedProject: LoadedLaobanProject,
    executionPlan: ScriptExecutionItem[][],
): Promise<ErrorsOr<unknown, BaseIssue>> {
    context.observability.log(`Script ${scriptName} execution`)

    const visitor: GenerationalWalkVisitor<
        ScriptExecutionInput,
        ScriptExecutionItem,
        WriteChannel
    > = {
        visit: async (_input, item, observability) =>
            executeOneScriptItem(
                context,
                scriptName,
                options,
                item,
                observability,
            ),

        displaySummary: async (
            _input: ScriptExecutionInput,
            summary: GenerationWalkSummary,
            observability: Observability,
        ) => {
            observability.log(
                `script ${scriptName}: ${summary.visitedItemCount}/${summary.plannedItemCount}`,
            )

            return value(undefined)
        },
    }

    const config: GenerationalWalkConfig<
        ScriptExecutionInput,
        ScriptExecutionItem,
        LaobanPackageChannelPurpose,
        ReadChannel,
        WriteChannel,
        Ref
    > = {
        observability: context.observability,
        channelsState: context.channelsState,

        load: async () =>
            value({
                loadedProject,
                fullPlan: executionPlan,
            }),

        toGenerations: input =>
            value(input.fullPlan),

        toModuleScope: (_input, item) =>
            moduleScopeOf(item),

        flush: out =>
            flushAllTouchedChannels(context.channelsState)(out),

        continueOnGenerationError: true,
    }

    return generationalWalk(config, visitor, context.stdOut)
}

export async function defaultHandleLaobanScript<
    ReadChannel,
    WriteChannel,
    Ref,
    ExecutorName extends string = string,
>(
    scriptName: ScriptName,
    script: LaobanScript,
    options: ScriptCommandValues,
    context: LaobanScriptExecutionContext<ReadChannel, WriteChannel, Ref, ExecutorName>,
): Promise<ErrorsOr<unknown, BaseIssue>> {
    return flatMapBaseIssueK(
        await context.loadConfigAndPackagesFn(context),
        async loadedProject =>
            flatMapBaseIssueK(
                makeScriptExecutionPlan(
                    loadedProject,
                    scriptName,
                    script,
                    context.observability,
                ),
                async executionPlan => {
                    const filtered = filterExecutionPlan(
                        loadedProject,
                        executionPlan.plan,
                        options,
                        context,
                    )

                    return flatMapBaseIssueK(
                        detemplateScriptExecutionPlan(
                            filtered,
                            loadedProject,
                            context.observability,
                        ),
                        async fullPlan => {
                            if (options.generationPlan) {
                                logPlan(
                                    scriptName,
                                    fullPlan,
                                    executionPlan.stats,
                                    context.observability,
                                )

                                return value(undefined)
                            }

                            if (options.variables) {
                                logVariables(
                                    loadedProject,
                                    fullPlan,
                                    context,
                                )

                                return value(undefined)
                            }

                            return executeScript(
                                context,
                                scriptName,
                                options,
                                loadedProject,
                                fullPlan,
                            )
                        },
                    )
                },
            ),
    )
}