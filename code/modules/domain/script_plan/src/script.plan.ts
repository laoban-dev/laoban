import {ErrorsOr} from "@laoban/errors";
import {Observability} from "@laoban/observability";
import {
    ExecutionItemPlannerTypeClass,
    ExecutionPlanPrettyPrintTypeClass,
    ExecutionPlanResult,
    makeExecutionPlan,
} from "@laoban/execution_plan";
import {LoadedLaobanProject, LoadedPackageDetail} from "@laoban/package_details";
import {LaobanCommand, LaobanScript, ScriptName} from "@laoban/scripts";
import {NameAndDependsOn, TopologicalGenerationIssue} from "@laoban/topologicalsort";


export interface ScriptExecutionItem {
    kind: "eachPackage" | "oncePerWorkSpace";
    stepIndex: number;
    command: LaobanCommand;
    pkg?: LoadedPackageDetail;
}

const loadedPackageDetailGraph: NameAndDependsOn<LoadedPackageDetail> = {
    getName: pkg => pkg.contents.name,
    dependsOn: pkg => pkg.contents.allLinks
};

const scriptExecutionItemTypeClass: ExecutionItemPlannerTypeClass<
    LaobanCommand,
    LoadedPackageDetail,
    ScriptExecutionItem
> = {
    makeEachPackage: (stepIndex, command, pkg) => ({
        kind: "eachPackage",
        stepIndex,
        command,
        pkg
    }),
    makeOncePerWorkspace: (stepIndex, command) => ({
        kind: "oncePerWorkSpace",
        stepIndex,
        command
    }),
    kind: item => item.kind,
    stepIndex: item => item.stepIndex,
    command: item => item.command,
    pkg: item => item.pkg,
    display: item =>
        item.kind === "oncePerWorkSpace"
            ? `[${item.stepIndex}] workspace ${item.command.command}`
            : `[${item.stepIndex}] ${item.pkg!.contents.name} ${item.command.command}`
};

export function makeScriptExecutionPlan(
    loadedProject: LoadedLaobanProject,
    scriptName: ScriptName,
    script: LaobanScript,
    observability: Observability
): ErrorsOr<
    ExecutionPlanResult<LoadedPackageDetail, ScriptExecutionItem>,
    TopologicalGenerationIssue
> {
    const commands = script.commands;
    const allPackages = Object
        .values(loadedProject.loadedPackageDetails)
        .sort((a, b) => a.contents.name.localeCompare(b.contents.name));

    const packagesForCommand = commands.map(command =>
        command.executionScope === "eachPackage" ? allPackages : []
    );

    const throttle = loadedProject.loadedLaobanConfig.config.throttle
    return makeExecutionPlan(
        `script ${scriptName}`,
        commands,
        throttle,
        packagesForCommand,
        scriptExecutionItemTypeClass,
        loadedPackageDetailGraph,
        observability
    );
}

export const scriptExecutionPlanPrettyPrintTypeClass: ExecutionPlanPrettyPrintTypeClass<ScriptExecutionItem> = {
    prefix: item => `[${item.stepIndex}] `,
    name: item => item.kind === "oncePerWorkSpace"
        ? "workspace"
        : item.pkg!.contents.name,
    script: item => item.command.command
};