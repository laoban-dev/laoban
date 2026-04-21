import {BaseIssue, ErrorsOr, errors, isErrors, value} from "@laoban/errors";
import {Observability} from "@laoban/observability";

export interface NameAndDependsOn<A> {
    /** Must return a stable unique identity across the reachable graph. */
    getName(a: A): string;

    /** Returns the direct prerequisites of this node. */
    dependsOn(a: A): A[];
}

export type TopologicalGenerationIssue =
    | BaseIssue<
    "duplicateGraphName",
    {
        purpose: string;
        duplicateName: string;
    }
>
    | BaseIssue<
    "graphCycle",
    {
        purpose: string;
        cyclePath: string[];
    }
>;

export type VisitState = "visiting" | "visited";

export interface TraversalState<A> {
    statesByName: Map<string, VisitState>;
    generationByName: Map<string, number>;
    nodesByName: Map<string, A>;
    activePath: A[];
    activeIndexByName: Map<string, number>;
}

export function topologicalGenerations<A>(
    purpose: string,
    roots: A[],
    graph: NameAndDependsOn<A>,
    observability: Observability
): ErrorsOr<A[][], TopologicalGenerationIssue> {
    const start = observability.timeService.now();
    observability.countMetric(runMetricName(purpose));
    debugTopologicalGenerationsStart(purpose, roots, graph, observability);

    const uniqueNames = validateUniqueNames(purpose, roots, graph, observability);
    if (isErrors(uniqueNames)) {
        observability.durationMetric(durationMetricName(purpose), elapsed(start, observability));
        return uniqueNames;
    }

    const state = newTraversalState<A>();
    const visited = visitAllRoots(purpose, roots, graph, state, observability);
    if (isErrors(visited)) {
        observability.durationMetric(durationMetricName(purpose), elapsed(start, observability));
        return visited;
    }

    const generations = buildGenerations(state, graph);
    debugTopologicalGenerationsFinished(purpose, generations, graph, observability);
    observability.durationMetric(durationMetricName(purpose), elapsed(start, observability));

    return value(generations);
}

export function validateUniqueNames<A>(
    purpose: string,
    roots: A[],
    graph: NameAndDependsOn<A>,
    observability: Observability
): ErrorsOr<void, TopologicalGenerationIssue> {
    const seenNames = new Map<string, A>();
    return validateUniqueNamesInNodes(purpose, roots, graph, seenNames, observability);
}

export function validateUniqueNamesInNodes<A>(
    purpose: string,
    nodes: A[],
    graph: NameAndDependsOn<A>,
    seenNames: Map<string, A>,
    observability: Observability
): ErrorsOr<void, TopologicalGenerationIssue> {
    for (const node of nodes) {
        const name = graph.getName(node);
        const existingNode = seenNames.get(name);

        if (existingNode !== undefined && existingNode !== node) {
            const issue = makeDuplicateGraphNameIssue(purpose, name);
            debugDuplicateGraphNameDetected(purpose, issue, observability);
            return errors(issue);
        }

        if (existingNode !== undefined) continue;

        seenNames.set(name, node);

        const dependsOnResult = validateUniqueNamesInNodes(
            purpose,
            graph.dependsOn(node),
            graph,
            seenNames,
            observability
        );
        if (isErrors(dependsOnResult)) return dependsOnResult;
    }

    return value(undefined);
}

export function newTraversalState<A>(): TraversalState<A> {
    return {
        statesByName: new Map(),
        generationByName: new Map(),
        nodesByName: new Map(),
        activePath: [],
        activeIndexByName: new Map(),
    };
}

export function visitAllRoots<A>(
    purpose: string,
    roots: A[],
    graph: NameAndDependsOn<A>,
    state: TraversalState<A>,
    observability: Observability
): ErrorsOr<void, TopologicalGenerationIssue> {
    for (const root of roots) {
        const result = visitNode(purpose, root, graph, state, observability);
        if (isErrors(result)) return result;
    }
    return value(undefined);
}

export function visitNode<A>(
    purpose: string,
    node: A,
    graph: NameAndDependsOn<A>,
    state: TraversalState<A>,
    observability: Observability
): ErrorsOr<number, TopologicalGenerationIssue> {
    const name = graph.getName(node);
    state.nodesByName.set(name, node);

    const existingState = state.statesByName.get(name);
    if (existingState === "visited") return value(state.generationByName.get(name)!);

    if (existingState === "visiting") {
        const cyclePath = findCyclePath(node, graph, state);
        const issue = makeCycleIssue(purpose, cyclePath);
        observability.countMetric(cycleMetricName(purpose));
        debugCycleDetected(purpose, issue, observability);
        return errors(issue);
    }

    enterNode(node, graph, state);
    debugVisitEnter(purpose, name, observability);

    const dependencyGenerations: number[] = [];
    for (const dependency of graph.dependsOn(node)) {
        const dependencyResult = visitNode(purpose, dependency, graph, state, observability);
        if (isErrors(dependencyResult)) return dependencyResult;
        dependencyGenerations.push(dependencyResult.value);
    }

    const generation = calculateGenerationFromDependencies(dependencyGenerations);
    leaveNode(node, generation, graph, state);
    debugVisitLeave(purpose, name, generation, observability);

    return value(generation);
}

export function enterNode<A>(
    node: A,
    graph: NameAndDependsOn<A>,
    state: TraversalState<A>
): void {
    const name = graph.getName(node);
    state.statesByName.set(name, "visiting");
    state.activeIndexByName.set(name, state.activePath.length);
    state.activePath.push(node);
}

export function leaveNode<A>(
    node: A,
    generation: number,
    graph: NameAndDependsOn<A>,
    state: TraversalState<A>
): void {
    const name = graph.getName(node);
    state.activePath.pop();
    state.activeIndexByName.delete(name);
    state.statesByName.set(name, "visited");
    state.generationByName.set(name, generation);
    state.nodesByName.set(name, node);
}

export function calculateGenerationFromDependencies(
    dependencyGenerations: number[]
): number {
    return dependencyGenerations.length === 0 ? 0 : Math.max(...dependencyGenerations) + 1;
}

export function findCyclePath<A>(
    node: A,
    graph: NameAndDependsOn<A>,
    state: TraversalState<A>
): string[] {
    const name = graph.getName(node);
    const startIndex = state.activeIndexByName.get(name) ?? 0;
    const cycleNames = state.activePath.slice(startIndex).map(graph.getName);
    return [...cycleNames, name];
}

export function makeDuplicateGraphNameIssue(
    purpose: string,
    duplicateName: string
): TopologicalGenerationIssue {
    return {
        kind: "duplicateGraphName",
        message: `Duplicate graph name detected in ${purpose}: ${duplicateName}`,
        context: {
            purpose,
            duplicateName,
        },
    };
}

export function makeCycleIssue(
    purpose: string,
    cyclePath: string[]
): TopologicalGenerationIssue {
    return {
        kind: "graphCycle",
        message: `Cycle detected in ${purpose}: ${cyclePath.join(" -> ")}`,
        context: {
            purpose,
            cyclePath,
        },
    };
}

export function buildGenerations<A>(
    state: TraversalState<A>,
    graph: NameAndDependsOn<A>
): A[][] {
    const byGeneration = new Map<number, A[]>();

    for (const [name, generation] of state.generationByName.entries()) {
        const node = state.nodesByName.get(name)!;
        const existing = byGeneration.get(generation) ?? [];
        existing.push(node);
        byGeneration.set(generation, existing);
    }

    return [...byGeneration.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, nodes]) =>
            [...nodes].sort((left, right) =>
                graph.getName(left).localeCompare(graph.getName(right))
            )
        );
}

export function elapsed(
    start: number,
    observability: Observability
): number {
    return observability.timeService.now() - start;
}

export function topologicalGenerationsContext(purpose: string): string {
    return `${purpose}.topologicalGenerations`;
}

export function topologicalGenerationsVisitContext(purpose: string): string {
    return `${purpose}.topologicalGenerations.visit`;
}

export function runMetricName(purpose: string): string {
    return `${purpose}.topologicalGenerations.run`;
}

export function cycleMetricName(purpose: string): string {
    return `${purpose}.topologicalGenerations.cycle`;
}

export function durationMetricName(purpose: string): string {
    return `${purpose}.topologicalGenerations.duration`;
}

export function debugTopologicalGenerationsStart<A>(
    purpose: string,
    roots: A[],
    graph: NameAndDependsOn<A>,
    observability: Observability
): void {
    observability.debug(
        topologicalGenerationsContext(purpose),
        "debug",
        "starting",
        {roots: roots.map(graph.getName)}
    );
}

export function debugVisitEnter(
    purpose: string,
    name: string,
    observability: Observability
): void {
    observability.debug(
        topologicalGenerationsVisitContext(purpose),
        "debug",
        "enter",
        {name}
    );
}

export function debugVisitLeave(
    purpose: string,
    name: string,
    generation: number,
    observability: Observability
): void {
    observability.debug(
        topologicalGenerationsVisitContext(purpose),
        "debug",
        "leave",
        {name, generation}
    );
}

export function debugDuplicateGraphNameDetected(
    purpose: string,
    issue: TopologicalGenerationIssue,
    observability: Observability
): void {
    observability.debug(
        topologicalGenerationsContext(purpose),
        "debug",
        "duplicateGraphNameDetected",
        issue
    );
}

export function debugCycleDetected(
    purpose: string,
    issue: TopologicalGenerationIssue,
    observability: Observability
): void {
    observability.debug(
        topologicalGenerationsContext(purpose),
        "debug",
        "cycleDetected",
        issue
    );
}

export function debugTopologicalGenerationsFinished<A>(
    purpose: string,
    generations: A[][],
    graph: NameAndDependsOn<A>,
    observability: Observability
): void {
    observability.debug(
        topologicalGenerationsContext(purpose),
        "debug",
        "finished",
        {
            generationCount: generations.length,
            generations: generations.map(generation => generation.map(graph.getName)),
        }
    );
}