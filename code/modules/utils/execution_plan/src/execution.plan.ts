import {ErrorsOr, mapErrorsOr} from "@laoban/errors"
import {Observability} from "@laoban/observability"
import {
    topologicalGenerations,
    NameAndDependsOn,
    TopologicalGenerationIssue,
} from "@laoban/topologicalsort"

/*
 * Workspace barriers are currently modelled conservatively:
 * - a workspace item depends on all earlier execution items
 * - all later execution items depend on earlier workspace items
 *
 * This keeps the model explicit and easy to reason about.
 * If very large workspaces ever make edge counts a problem, this can later be
 * optimised by introducing a virtual barrier node without changing the domain
 * meaning of the plan.
 */

export type ExecutionScope = "eachPackage" | "oncePerWorkSpace"
export type ExecutionItemKind = ExecutionScope

export type ExecutionPlanDebugArea =
    | readonly ["execution", "plan", "start"]
    | readonly ["execution", "plan", "finished"]

const executionPlanStartDebug: ExecutionPlanDebugArea = ["execution", "plan", "start"]
const executionPlanFinishedDebug: ExecutionPlanDebugArea = ["execution", "plan", "finished"]

/**
 * One package-scoped unit of work in the execution plan.
 *
 * C = the command type carried by the execution item
 * P = the package type carried by the execution item
 */
export interface EachPackageExecutionItem<C, P> {
    kind: "eachPackage"
    stepIndex: number
    command: C
    pkg: P
}

/**
 * One workspace-scoped unit of work in the execution plan.
 *
 * C = the command type carried by the execution item
 */
export interface OncePerWorkspaceExecutionItem<C> {
    kind: "oncePerWorkSpace"
    stepIndex: number
    command: C
}

/**
 * A concrete execution item in the execution graph and plan.
 *
 * C = the command type
 * P = the package type
 */
export type ExecutionItem<C, P> =
    | EachPackageExecutionItem<C, P>
    | OncePerWorkspaceExecutionItem<C>

/**
 * Planner-facing typeclass for constructing and inspecting execution items.
 *
 * This is intentionally separate from any later executor-facing typeclass.
 *
 * Generic parameters:
 * - C = the command type used by the script model
 * - P = the package type used by the package graph
 * - H = the execution-item type used by the planner
 *
 * In the simplest case H may just be ExecutionItem<C, P>, but the planner is
 * generic so callers can use a richer execution-item type if needed.
 */
export interface ExecutionItemPlannerTypeClass<C, P, H> {
    makeEachPackage(stepIndex: number, command: C, pkg: P): H

    makeOncePerWorkspace(stepIndex: number, command: C): H

    kind(h: H): ExecutionItemKind

    stepIndex(h: H): number

    command(h: H): C

    pkg(h: H): P | undefined

    display(h: H): string
}

export interface ExecutionPlanStats<P> {
    commandCount: number
    distinctPackageDetails: P[]

    executionItemCount: number
    packageExecutionItemCount: number
    barrierCount: number

    generationCount: number
    largestGenerationSize: number
}

export interface ExecutionPlanResult<P, H> {
    plan: H[][]
    stats: ExecutionPlanStats<P>
}

/**
 * Builds a stable unique graph name for an execution item.
 *
 * This name is suitable for use as the node identity in the derived
 * NameAndDependsOn<H> execution graph.
 *
 * It is also readable enough for debugging, which is why it is based on the
 * step index plus package/workspace identity.
 *
 * Generic parameters:
 * - C = the command type
 * - P = the package type
 * - H = the execution-item type
 */
export function executionItemGraphName<C, P, H>(
    h: H,
    tc: ExecutionItemPlannerTypeClass<C, P, H>,
    packageTc: NameAndDependsOn<P>,
): string {
    if (tc.kind(h) === "eachPackage") {
        const pkg = tc.pkg(h)
        if (!pkg) throw new Error(`Execution item ${tc.display(h)} claimed kind eachPackage but had no package`)
        return `step:${tc.stepIndex(h)}:pkg:${packageTc.getName(pkg)}`
    }

    return `step:${tc.stepIndex(h)}:workspace`
}

/**
 * Builds the execution items for one script run.
 *
 * commands and packagesForCommand must have the same length.
 *
 * For eachPackage commands, one execution item is created per package in the
 * corresponding packagesForCommand entry.
 *
 * For oncePerWorkSpace commands, exactly one workspace execution item is
 * created and the corresponding packagesForCommand entry is ignored.
 */
export function buildExecutionItems<C extends { executionScope: ExecutionScope }, P, H>(
    commands: C[],
    packagesForCommand: P[][],
    tc: ExecutionItemPlannerTypeClass<C, P, H>,
): H[] {
    if (commands.length !== packagesForCommand.length) {
        throw new Error(
            `buildExecutionItems expected commands.length (${commands.length}) to equal packagesForCommand.length (${packagesForCommand.length})`,
        )
    }

    const result: H[] = []

    for (let stepIndex = 0; stepIndex < commands.length; stepIndex++) {
        const command = commands[stepIndex]

        if (command.executionScope === "eachPackage") {
            for (const pkg of packagesForCommand[stepIndex]) {
                result.push(tc.makeEachPackage(stepIndex, command, pkg))
            }
        } else {
            result.push(tc.makeOncePerWorkspace(stepIndex, command))
        }
    }

    return result
}

function findNearestEarlierPackageItem<C, P, H>(
    item: H,
    items: H[],
    tc: ExecutionItemPlannerTypeClass<C, P, H>,
    packageTc: NameAndDependsOn<P>,
): H | undefined {
    if (tc.kind(item) !== "eachPackage") return undefined

    const pkg = tc.pkg(item)
    if (!pkg) throw new Error(`Execution item ${tc.display(item)} claimed kind eachPackage but had no package`)

    const itemStep = tc.stepIndex(item)
    const itemPkgName = packageTc.getName(pkg)

    let best: H | undefined = undefined
    let bestStep = -1

    for (const candidate of items) {
        if (tc.kind(candidate) !== "eachPackage") continue

        const candidatePkg = tc.pkg(candidate)
        if (!candidatePkg) {
            throw new Error(`Execution item ${tc.display(candidate)} claimed kind eachPackage but had no package`)
        }

        const candidateStep = tc.stepIndex(candidate)
        if (candidateStep >= itemStep) continue
        if (packageTc.getName(candidatePkg) !== itemPkgName) continue

        if (candidateStep > bestStep) {
            best = candidate
            bestStep = candidateStep
        }
    }

    return best
}

/**
 * Returns the predecessor names for one execution item, following the ADR:
 *
 * 1. package dependency edges within the same eachPackage step
 * 2. workflow-order edge from the nearest earlier actual step for the same package
 * 3. workspace barrier edges:
 *    - workspace depends on all earlier items
 *    - later items depend on earlier workspace items
 */
export function dependsOnExecutionItem<C, P, H>(
    item: H,
    items: H[],
    tc: ExecutionItemPlannerTypeClass<C, P, H>,
    packageTc: NameAndDependsOn<P>,
): string[] {
    const result = new Set<string>()
    const itemStep = tc.stepIndex(item)

    if (tc.kind(item) === "eachPackage") {
        const pkg = tc.pkg(item)
        if (!pkg) throw new Error(`Execution item ${tc.display(item)} claimed kind eachPackage but had no package`)

        const pkgDependencyNames = new Set(packageTc.dependsOn(pkg))

        for (const candidate of items) {
            if (tc.kind(candidate) !== "eachPackage") continue
            if (tc.stepIndex(candidate) !== itemStep) continue

            const candidatePkg = tc.pkg(candidate)
            if (!candidatePkg) {
                throw new Error(`Execution item ${tc.display(candidate)} claimed kind eachPackage but had no package`)
            }

            const candidatePkgName = packageTc.getName(candidatePkg)
            if (pkgDependencyNames.has(candidatePkgName)) {
                result.add(executionItemGraphName(candidate, tc, packageTc))
            }
        }

        const previous = findNearestEarlierPackageItem(item, items, tc, packageTc)
        if (previous) {
            result.add(executionItemGraphName(previous, tc, packageTc))
        }

        for (const candidate of items) {
            if (tc.kind(candidate) !== "oncePerWorkSpace") continue
            if (tc.stepIndex(candidate) < itemStep) {
                result.add(executionItemGraphName(candidate, tc, packageTc))
            }
        }

        return [...result]
    }

    for (const candidate of items) {
        if (tc.stepIndex(candidate) < itemStep) {
            result.add(executionItemGraphName(candidate, tc, packageTc))
        }
    }

    return [...result]
}

/**
 * Builds the derived execution graph over H.
 */
export function buildExecutionGraph<C, P, H>(
    items: H[],
    tc: ExecutionItemPlannerTypeClass<C, P, H>,
    packageTc: NameAndDependsOn<P>,
): NameAndDependsOn<H> {
    return {
        getName: h => executionItemGraphName(h, tc, packageTc),
        dependsOn: h => dependsOnExecutionItem(h, items, tc, packageTc),
    }
}

function distinctPackageDetails<P>(
    packagesForCommand: P[][],
    packageTc: NameAndDependsOn<P>,
): P[] {
    const result: P[] = []
    const seen = new Set<string>()

    for (const packages of packagesForCommand) {
        for (const pkg of packages) {
            const name = packageTc.getName(pkg)
            if (!seen.has(name)) {
                seen.add(name)
                result.push(pkg)
            }
        }
    }

    return result
}

function makeExecutionPlanStats<C, P, H>(
    commands: C[],
    packagesForCommand: P[][],
    items: H[],
    plan: H[][],
    tc: ExecutionItemPlannerTypeClass<C, P, H>,
    packageTc: NameAndDependsOn<P>,
): ExecutionPlanStats<P> {
    const distinctPackages = distinctPackageDetails(packagesForCommand, packageTc)
    const packageExecutionItemCount = items.filter(i => tc.kind(i) === "eachPackage").length
    const barrierCount = items.filter(i => tc.kind(i) === "oncePerWorkSpace").length
    const largestGenerationSize = plan.length === 0 ? 0 : Math.max(...plan.map(g => g.length))

    return {
        commandCount: commands.length,
        distinctPackageDetails: distinctPackages,
        executionItemCount: items.length,
        packageExecutionItemCount,
        barrierCount,
        generationCount: plan.length,
        largestGenerationSize,
    }
}

function debugExecutionPlanStart<C extends { executionScope: ExecutionScope }, P>(
    purpose: string,
    commands: C[],
    packagesForCommand: P[][],
    observability: Observability,
): void {
    observability.debug(
        executionPlanStartDebug,
        "debug",
        {
            purpose,
            commandCount: commands.length,
            packageSetCount: packagesForCommand.length,
        },
    )
}

function debugExecutionPlanFinished<P>(
    purpose: string,
    stats: ExecutionPlanStats<P>,
    observability: Observability,
): void {
    observability.debug(
        executionPlanFinishedDebug,
        "debug",
        {
            purpose,
            commandCount: stats.commandCount,
            distinctPackageDetailCount: stats.distinctPackageDetails.length,
            executionItemCount: stats.executionItemCount,
            packageExecutionItemCount: stats.packageExecutionItemCount,
            barrierCount: stats.barrierCount,
            generationCount: stats.generationCount,
            largestGenerationSize: stats.largestGenerationSize,
        },
    )
}

/**
 * Builds the final execution plan as topological generations of execution items.
 */
export function makeExecutionPlan<C extends { executionScope: ExecutionScope }, P, H>(
    purpose: string,
    commands: C[],
    packagesForCommand: P[][],
    tc: ExecutionItemPlannerTypeClass<C, P, H>,
    packageTc: NameAndDependsOn<P>,
    observability: Observability,
): ErrorsOr<ExecutionPlanResult<P, H>, TopologicalGenerationIssue> {
    debugExecutionPlanStart(purpose, commands, packagesForCommand, observability)

    const items = buildExecutionItems(commands, packagesForCommand, tc)
    const graph = buildExecutionGraph(items, tc, packageTc)

    return mapErrorsOr(
        topologicalGenerations(`${purpose}:execution_plan`, items, graph, observability),
        generations => {
            const plan = generations.filter(g => g.length > 0)
            const stats = makeExecutionPlanStats(commands, packagesForCommand, items, plan, tc, packageTc)
            debugExecutionPlanFinished(purpose, stats, observability)

            return {plan, stats}
        },
    )
}