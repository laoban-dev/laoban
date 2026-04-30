import {
    BaseIssue,
    errors,
    ErrorsOr,
    flatMapBaseIssueK,
    isErrors,
    traverseArrayErrorsOrK,
    value,
} from "@laoban/errors"
import {ExecutionPlanStats, prettyPrintExecutionPlan} from "@laoban/execution_plan"
import {
    ChannelObservability,
    channelObservabilityWithModule,
    flush,
    ModuleName,
    ModuleObservabilityScope,
    Observability,
    writeToChannel,
} from "@laoban/observability"
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
import {NodeExecution} from "@laoban/node_execution"
import {LaobanScriptCliContext, ScriptCommandValues} from "./script.context"

export type LaobanScriptExecutionContext =
    LaobanScriptCliContext & {
    execution: NodeExecution
}

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

function logVariables<TContext extends LaobanScriptCliContext>(
    loadedProject: LoadedLaobanProject,
    fullPlan: ScriptExecutionItem[][],
    context: TContext,
): void {
    context.observability.log(prettyPrintPlanWithRhs(fullPlan, packageNameOf, item => {
        const dictionary = context.makeDictionary(item, loadedProject)
        return safePrettyJson(dictionary)
    }))
}

function executionDirectoryOf(item: ScriptExecutionItem): DirectoryName {
    const result = item.pkg!.dir
    if (!result) throw new Error(`Script execution item has no command directory: ${item.command.command}`)

    return result
}

function moduleScopeOf(item: ScriptExecutionItem): ModuleObservabilityScope {
    return {
        module: item.pkg!.contents.name,
        directory: item.pkg!.dir,
    }
}

/**
 * Create a module-scoped channel observability for one unit of script work,
 * run the supplied block, and always close the module channels afterwards.
 *
 * This owns channel lifecycle for one module execution item.
 *
 * It deliberately does not flush. Flush is generation-level projection from
 * durable logs to stdout and remains in executeScript after each generation.
 */
async function withModuleObservability<TContext extends LaobanScriptExecutionContext, T>(
    context: TContext,
    moduleScope: ModuleObservabilityScope,
    fn: (observability: ChannelObservability) => Promise<T>,
): Promise<T> {
    const observability = channelObservabilityWithModule(
        {
            ...context.observability,
            moduleScope,
        },
        moduleScope,
        context.channelsState,
    )

    try {
        return await fn(observability)
    } finally {
        await observability.close()
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

async function executeOneScriptItem<TContext extends LaobanScriptExecutionContext>(
    context: TContext,
    scriptName: ScriptName,
    options: ScriptCommandValues,
    item: ScriptExecutionItem,
): Promise<ErrorsOr<number, BaseIssue>> {
    const moduleScope = moduleScopeOf(item)
    const moduleName = moduleScope.module

    return withModuleObservability(context, moduleScope, async observability => {
        const cwd = executionDirectoryOf(item)

        const result = await context.execution.execute({
            command: item.command.command,
            cwd,
            env: {},
            writable: context.stdOut,
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
    })
}

async function flushGeneration<TContext extends LaobanScriptExecutionContext>(
    context: TContext,
    generation: ScriptExecutionItem[],
): Promise<ErrorsOr<unknown, BaseIssue>> {
    const write = writeToChannel(context.channelsState.tc, context.channelsState.onError)(context.stdOut)

    const issues: BaseIssue[] = []

    for (const item of generation) {
        const result = await flush(context.channelsState)(moduleScopeOf(item))(write)

        if (isErrors(result))
            issues.push(...result.errors)
    }

    return issues.length > 0
        ? {errors: issues}
        : value(undefined)
}

async function executeScript<TContext extends LaobanScriptExecutionContext>(
    context: TContext,
    scriptName: ScriptName,
    options: ScriptCommandValues,
    executionPlan: ScriptExecutionItem[][],
): Promise<ErrorsOr<void, BaseIssue>> {
    context.observability.log(`Script ${scriptName} execution`)

    const issues: BaseIssue[] = []

    for (const generation of executionPlan) {
        const generationErrors = await traverseArrayErrorsOrK(generation, async item =>
            executeOneScriptItem(context, scriptName, options, item),
        )

        const flushResult = await flushGeneration(context, generation)

        if (isErrors(generationErrors))
            issues.push(...generationErrors.errors)

        if (isErrors(flushResult))
            issues.push(...flushResult.errors)
    }

    return issues.length > 0
        ? {errors: issues}
        : value(undefined)
}

export async function defaultHandleLaobanScript<TContext extends LaobanScriptExecutionContext>(
    scriptName: ScriptName,
    script: LaobanScript,
    options: ScriptCommandValues,
    context: TContext,
): Promise<ErrorsOr<void, BaseIssue>> {
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

                    return await flatMapBaseIssueK(
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
                                logVariables(loadedProject, fullPlan, context)
                                return value(undefined)
                            }

                            return await executeScript(
                                context,
                                scriptName,
                                options,
                                fullPlan,
                            )
                        },
                    )
                },
            ),
    )
}