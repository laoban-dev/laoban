import {
    BaseIssue,
    ErrorsOr,
    flatMapBaseIssue, isValue,
    mapBaseIssue
} from "@laoban/errors";
import {
    ExecutionPlanStats,
    prettyPrintExecutionPlan
} from "@laoban/execution_plan";
import {Observability} from "@laoban/observability";
import {LoadedLaobanProject, LoadedPackageDetail} from "@laoban/package_details";
import {LaobanScript, ScriptName} from "@laoban/scripts";
import {LaobanScriptCliContext, ScriptCommandValues} from "./scripts.cli";
import {
    makeScriptExecutionPlan,
    ScriptExecutionItem,
    scriptExecutionPlanPrettyPrintTypeClass
} from "@laoban/script_plan";
import {
    detemplateOneScriptExecutionItem,
    detemplateScriptExecutionPlan,
    makeScriptExecutionItemTemplateDictionary
} from "./resolve.templates";
import {sortObjectByName} from "@laoban/records";
import {safePrettyJson} from "@laoban/safe";
import {filterExecutionPlan} from "./filter.packages";

function logPlan(
    scriptName: ScriptName,
    plan: ScriptExecutionItem[][],
    stats: ExecutionPlanStats<LoadedPackageDetail>,
    {logger}: Observability
): void {
    logger("info", `Plan for script: ${scriptName}`);
    logger("info", "\n" + prettyPrintExecutionPlan(plan, scriptExecutionPlanPrettyPrintTypeClass));
    logger("info", "Stats");
    logger("info", `  commandCount: ${stats.commandCount}`);
    logger("info", `  distinctPackageDetails: ${stats.distinctPackageDetails.length}`);
    logger("info", `  executionItemCount: ${stats.executionItemCount}`);
    logger("info", `  packageExecutionItemCount: ${stats.packageExecutionItemCount}`);
    logger("info", `  barrierCount: ${stats.barrierCount}`);
    logger("info", `  generationCount: ${stats.generationCount}`);
    logger("info", `  largestGenerationSize: ${stats.largestGenerationSize}`);
}

function packageNameOf(item: ScriptExecutionItem): string {
    return item.kind === "oncePerWorkSpace"
        ? "workspace"
        : item.pkg!.contents.name;
}

function prettyPrintPlanWithRhs<G>(
    plan: G[][],
    nameOf: (g: G) => string,
    rhsOf: (g: G) => string,
    linePrefix: string = "Package: "
): string {
    const maxNameWidth = plan.reduce(
        (max, generation) => Math.max(
            max,
            0,
            ...generation.map(item => nameOf(item).length)
        ),
        0
    );
    return plan
        .reduce(
            (acc: string[], generation: G[]) =>
                acc.concat(
                    generation.map((item: G) =>
                        `${linePrefix}${nameOf(item).padEnd(maxNameWidth)} ${rhsOf(item)}`
                    )
                ),
            []
        )
        .join("\n");
}

function logDryRunPlan(
    fullPlan: ScriptExecutionItem[][],
    {logger}: Observability
): void {
    logger("info", '\n'+prettyPrintPlanWithRhs(fullPlan, packageNameOf, item => item.command.command));
}

function logVariables<TContext extends LaobanScriptCliContext>(loadedProject: LoadedLaobanProject, fullPlan: ScriptExecutionItem[][], context: TContext) {
    const observability = context.observability;
    observability.logger("info", prettyPrintPlanWithRhs(fullPlan, packageNameOf, item => {
        const dictionary = context.makeDictionary(item, loadedProject);
        return safePrettyJson(dictionary)
    }));
}

export async function defaultHandleLaobanScript<TContext extends LaobanScriptCliContext>(
    scriptName: ScriptName,
    script: LaobanScript,
    options: ScriptCommandValues,
    context: TContext
): Promise<ErrorsOr<void, BaseIssue>> {
    return flatMapBaseIssue(
        await context.loadConfigAndPackagesFn(context),
        loadedProject =>
            flatMapBaseIssue(
                makeScriptExecutionPlan(
                    loadedProject,
                    scriptName,
                    script,
                    context.observability
                ),
                executionPlan => {
                    const filtered = filterExecutionPlan(loadedProject, executionPlan.plan, options, context)
                    return mapBaseIssue(
                        detemplateScriptExecutionPlan(
                            filtered,
                            loadedProject,
                            context.observability
                        ),
                        fullPlan => {
                            if (options.generationPlan) {
                                logPlan(
                                    scriptName,
                                    fullPlan,
                                    executionPlan.stats,
                                    context.observability
                                );
                            } else if (options.dryrun) logDryRunPlan(fullPlan, context.observability);
                            else if (options.variables) logVariables(loadedProject, fullPlan, context);
                            else {
                                context.observability.logger(
                                    "info",
                                    `Script ${scriptName} execution not implemented yet`
                                );
                            }
                        }
                    );
                }
            )
    );
}