import {valueOrThrow} from "@laoban/errors";
import {ExecutionPlanStats, prettyPrintExecutionPlan} from "@laoban/execution_plan";
import {Observability} from "@laoban/observability";
import {LoadedPackageDetail} from "@laoban/package_details";

import {LaobanScript, ScriptName} from "@laoban/scripts";
import {LaobanScriptCliContext, ScriptCommandValues} from "./scripts.cli";
import {
    makeScriptExecutionPlan,
    ScriptExecutionItem,
    scriptExecutionPlanPrettyPrintTypeClass
} from "@laoban/script_plan/src/script.plan";

function displayItem(item: ScriptExecutionItem): string {
    return item.kind === "oncePerWorkSpace"
        ? `    - [${item.stepIndex}] workspace ${item.command.command}`
        : `    - [${item.stepIndex}] ${item.pkg!.contents.name} ${item.command.command}`;
}

function logPlan(
    scriptName: ScriptName,
    plan: ScriptExecutionItem[][],
    stats: ExecutionPlanStats<LoadedPackageDetail>,
    {logger}: Observability
): void {
    logger("info", `Plan for script: ${scriptName}`);
    const printedPlan = prettyPrintExecutionPlan(plan, scriptExecutionPlanPrettyPrintTypeClass)
    logger("info", "\n" + printedPlan);


    logger("info", "Stats");
    logger("info", `  commandCount: ${stats.commandCount}`);
    logger("info", `  distinctPackageDetails: ${stats.distinctPackageDetails.length}`);
    logger("info", `  executionItemCount: ${stats.executionItemCount}`);
    logger("info", `  packageExecutionItemCount: ${stats.packageExecutionItemCount}`);
    logger("info", `  barrierCount: ${stats.barrierCount}`);
    logger("info", `  generationCount: ${stats.generationCount}`);
    logger("info", `  largestGenerationSize: ${stats.largestGenerationSize}`);
}

export async function defaultHandleLaobanScript(
    scriptName: ScriptName,
    script: LaobanScript,
    values: ScriptCommandValues,
    context: LaobanScriptCliContext
): Promise<{}> {
    const loadedProject = valueOrThrow(
        await context.loadConfigAndPackagesFn(context)
    );

    const executionPlan = valueOrThrow(
        makeScriptExecutionPlan(
            loadedProject,
            scriptName,
            script,
            context.observability
        )
    );

    if (values.generationPlan) {
        logPlan(scriptName, executionPlan.plan, executionPlan.stats, context.observability);
        return {};
    }

    context.observability.logger("info", `Script ${scriptName} execution not implemented yet`);
    return {};
}