import {BaseIssue, ErrorsOr, errors, isErrors, value} from "@laoban/errors";
import {Observability} from "@laoban/observability";

export interface NameAndDependsOn<A> {
    /** Must return a stable unique identity across the reachable graph. */
    getName(a: A): string;

    /** Returns the direct prerequisite names of this node. */
    dependsOn(a: A): string[];
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
    "missingGraphDependency",
    {
        purpose: string;
        nodeName: string;
        missingDependencyName: string;
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
    activePath: string[];
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

    const nodesByName = indexNodesByName(purpose, roots, graph, observability);
    if (isErrors(nodesByName)) {
        observability.durationMetric(durationMetricName(purpose), elapsed(start, observability));
        return nodesByName;
    }

    const state = newTraversalState<A>(nodesByName.value);
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

export function indexNodesByName<A>(
    purpose: string,
    roots: A[],
    graph: NameAndDependsOn<A>,
    observability: Observability
): ErrorsOr<Map<string, A>, TopologicalGenerationIssue> {
    const nodesByName = new Map<string, A>();

    for (const node of roots) {
        const name = graph.getName(node);
        const existingNode = nodesByName.get(name);

        if (existingNode !== undefined && existingNode !== node) {
            const issue = makeDuplicateGraphNameIssue(purpose, name);
            debugDuplicateGraphNameDetected(purpose, issue, observability);
            return errors(issue);
        }

        if (existingNode !== undefined) continue;
        nodesByName.set(name, node);
    }

    return value(nodesByName);
}

export function newTraversalState<A>(nodesByName: Map<string, A>): TraversalState<A> {
    return {
        statesByName: new Map(),
        generationByName: new Map(),
        nodesByName,
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

    const existingState = state.statesByName.get(name);
    if (existingState === "visited") return value(state.generationByName.get(name)!);

    if (existingState === "visiting") {
        const cyclePath = findCyclePath(name, state);
        const issue = makeCycleIssue(purpose, cyclePath);
        observability.countMetric(cycleMetricName(purpose));
        debugCycleDetected(purpose, issue, observability);
        return errors(issue);
    }

    enterNode(name, state);
    debugVisitEnter(purpose, name, observability);

    const dependencyGenerations: number[] = [];
    for (const dependencyName of graph.dependsOn(node)) {
        const dependency = state.nodesByName.get(dependencyName);
        if (dependency === undefined) {
            const issue = makeMissingGraphDependencyIssue(purpose, name, dependencyName);
            debugMissingDependencyDetected(purpose, issue, observability);
            return errors(issue);
        }

        const dependencyResult = visitNode(purpose, dependency, graph, state, observability);
        if (isErrors(dependencyResult)) return dependencyResult;
        dependencyGenerations.push(dependencyResult.value);
    }

    const generation = calculateGenerationFromDependencies(dependencyGenerations);
    leaveNode(name, generation, state);
    debugVisitLeave(purpose, name, generation, observability);

    return value(generation);
}

export function enterNode(
    name: string,
    state: TraversalState<any>
): void {
    state.statesByName.set(name, "visiting");
    state.activeIndexByName.set(name, state.activePath.length);
    state.activePath.push(name);
}

export function leaveNode(
    name: string,
    generation: number,
    state: TraversalState<any>
): void {
    state.activePath.pop();
    state.activeIndexByName.delete(name);
    state.statesByName.set(name, "visited");
    state.generationByName.set(name, generation);
}

export function calculateGenerationFromDependencies(
    dependencyGenerations: number[]
): number {
    return dependencyGenerations.length === 0 ? 0 : Math.max(...dependencyGenerations) + 1;
}

export function findCyclePath(
    name: string,
    state: TraversalState<any>
): string[] {
    const startIndex = state.activeIndexByName.get(name) ?? 0;
    const cycleNames = state.activePath.slice(startIndex);
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

export function makeMissingGraphDependencyIssue(
    purpose: string,
    nodeName: string,
    missingDependencyName: string
): TopologicalGenerationIssue {
    return {
        kind: "missingGraphDependency",
        message: `Missing graph dependency in ${purpose}: '${nodeName}' depends on '${missingDependencyName}' but it is not present`,
        context: {
            purpose,
            nodeName,
            missingDependencyName,
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

export function debugMissingDependencyDetected(
    purpose: string,
    issue: TopologicalGenerationIssue,
    observability: Observability
): void {
    observability.debug(
        topologicalGenerationsContext(purpose),
        "debug",
        "missingDependencyDetected",
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