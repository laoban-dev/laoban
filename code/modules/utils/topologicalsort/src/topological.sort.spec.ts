import {errorsOrThrow, valueOrThrow} from "@laoban/errors";
import {recordingObservability} from "@laoban/observability";
import {
    buildGenerations,
    calculateGenerationFromDependencies,
    cycleMetricName,
    durationMetricName,
    findCyclePath,
    indexNodesByName,
    makeCycleIssue,
    makeDuplicateGraphNameIssue,
    makeMissingGraphDependencyIssue,
    NameAndDependsOn,
    newTraversalState,
    runMetricName,
    topologicalGenerations,
    topologicalGenerationsContext,
    topologicalGenerationsVisitContext,
} from "./topological.sort";

type TestNode = {
    name: string;
    dependsOn?: string[];
};

const node = (name: string, dependsOn: string[] = []): TestNode => ({name, dependsOn});

const graph: NameAndDependsOn<TestNode> = {
    getName: n => n.name,
    dependsOn: n => n.dependsOn ?? [],
};

const names = (generations: TestNode[][]): string[][] =>
    generations.map(generation => generation.map(n => n.name));

describe("topologicalGenerations", () => {
    it("returns empty generations when given no roots", () => {
        const {observability, counts, durations, debug} = recordingObservability();

        const result = topologicalGenerations("package.dependencies", [], graph, observability);

        expect(valueOrThrow(result)).toEqual([]);
        expect(counts).toEqual([runMetricName("package.dependencies")]);
        expect(durations).toHaveLength(1);
        expect(debug[0]).toEqual({
            context: topologicalGenerationsContext("package.dependencies"),
            level: "debug",
            msg: ["starting", {roots: []}],
        });
        expect(debug[debug.length - 1]).toEqual({
            context: topologicalGenerationsContext("package.dependencies"),
            level: "debug",
            msg: ["finished", {generationCount: 0, generations: []}],
        });
    });

    it("puts a single node in generation zero", () => {
        const {observability} = recordingObservability();
        const a = node("a");

        const result = topologicalGenerations("package.dependencies", [a], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([["a"]]);
    });

    it("orders a simple chain by generations", () => {
        const {observability} = recordingObservability();
        const c = node("c");
        const b = node("b", ["c"]);
        const a = node("a", ["b"]);

        const result = topologicalGenerations("package.dependencies", [a, b, c], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([
            ["c"],
            ["b"],
            ["a"],
        ]);
    });

    it("orders a diamond with shared dependency only once", () => {
        const {observability} = recordingObservability();
        const d = node("d");
        const b = node("b", ["d"]);
        const c = node("c", ["d"]);
        const a = node("a", ["b", "c"]);

        const result = topologicalGenerations("package.dependencies", [a, b, c, d], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([
            ["d"],
            ["b", "c"],
            ["a"],
        ]);
    });

    it("handles multiple roots and sorts nodes deterministically within a generation", () => {
        const {observability} = recordingObservability();
        const z = node("z");
        const a = node("a");
        const root1 = node("root1", ["z"]);
        const root2 = node("root2", ["a"]);

        const result = topologicalGenerations("package.dependencies", [root1, root2, z, a], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([
            ["a", "z"],
            ["root1", "root2"],
        ]);
    });

    it("detects a cycle and returns the named cycle path", () => {
        const {observability, counts, debug} = recordingObservability();

        const a = node("a", ["b"]);
        const b = node("b", ["c"]);
        const c = node("c", ["a"]);

        const result = topologicalGenerations("building.execution.plan", [a, b, c], graph, observability);

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "graphCycle",
                message: "Cycle detected in building.execution.plan: a -> b -> c -> a",
                context: {
                    purpose: "building.execution.plan",
                    cyclePath: ["a", "b", "c", "a"],
                }
            }
        ]);

        expect(counts).toContain(runMetricName("building.execution.plan"));
        expect(counts).toContain(cycleMetricName("building.execution.plan"));
        expect(debug.some(d =>
            d.context === topologicalGenerationsContext("building.execution.plan") &&
            d.msg[0] === "cycleDetected"
        )).toBe(true);
    });

    it("rejects duplicate names when different node instances share the same name", () => {
        const {observability} = recordingObservability();

        const sharedName1 = node("dup");
        const sharedName2 = node("dup");
        const root = node("root", ["dup"]);

        const result = topologicalGenerations("package.dependencies", [root, sharedName1, sharedName2], graph, observability);

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "duplicateGraphName",
                message: "Duplicate graph name detected in package.dependencies: dup",
                context: {
                    purpose: "package.dependencies",
                    duplicateName: "dup",
                }
            }
        ]);
    });

    it("writes visit debug records with the purpose-based visit context", () => {
        const {observability, debug} = recordingObservability();
        const b = node("b");
        const a = node("a", ["b"]);

        const result = topologicalGenerations("package.dependencies", [a, b], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([
            ["b"],
            ["a"],
        ]);

        expect(debug).toEqual(
            expect.arrayContaining([
                {
                    context: topologicalGenerationsVisitContext("package.dependencies"),
                    level: "debug",
                    msg: ["enter", {name: "a"}],
                },
                {
                    context: topologicalGenerationsVisitContext("package.dependencies"),
                    level: "debug",
                    msg: ["enter", {name: "b"}],
                },
                {
                    context: topologicalGenerationsVisitContext("package.dependencies"),
                    level: "debug",
                    msg: ["leave", {name: "b", generation: 0}],
                },
                {
                    context: topologicalGenerationsVisitContext("package.dependencies"),
                    level: "debug",
                    msg: ["leave", {name: "a", generation: 1}],
                },
            ])
        );
    });

    it("records a duration metric for the run", () => {
        let now = 1000;
        const timeService = {now: () => now++};
        const {observability, durations} = recordingObservability({}, "test-correlation-id", timeService);
        const a = node("a");

        const result = topologicalGenerations("package.dependencies", [a], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([["a"]]);
        expect(durations).toEqual([
            {
                name: durationMetricName("package.dependencies"),
                durationMs: 1,
            },
        ]);
    });

    it("returns missingGraphDependency when a dependency name is not present", () => {
        const {observability} = recordingObservability();
        const a = node("a", ["missing"]);

        const result = topologicalGenerations("package.dependencies", [a], graph, observability);

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "missingGraphDependency",
                message: "Missing graph dependency in package.dependencies: 'a' depends on 'missing' but it is not present",
                context: {
                    purpose: "package.dependencies",
                    nodeName: "a",
                    missingDependencyName: "missing",
                }
            }
        ]);
    });
});

describe("indexNodesByName", () => {
    it("returns value when all names are unique", () => {
        const {observability} = recordingObservability();
        const c = node("c");
        const b = node("b", ["c"]);
        const a = node("a", ["b"]);

        const result = indexNodesByName("package.dependencies", [a, b, c], graph, observability);

        const nodesByName = valueOrThrow(result);
        expect(Array.from(nodesByName.keys()).sort()).toEqual(["a", "b", "c"]);
    });

    it("returns an error for duplicate names across different node instances", () => {
        const {observability} = recordingObservability();
        const x1 = node("x");
        const x2 = node("x");

        const result = indexNodesByName("package.dependencies", [x1, x2], graph, observability);

        expect(errorsOrThrow(result)).toEqual([
            makeDuplicateGraphNameIssue("package.dependencies", "x")
        ]);
    });
});

describe("small helpers", () => {
    it("calculateGenerationFromDependencies returns zero for no dependencies", () => {
        expect(calculateGenerationFromDependencies([])).toBe(0);
    });

    it("calculateGenerationFromDependencies returns one more than the max dependency generation", () => {
        expect(calculateGenerationFromDependencies([0, 2, 1])).toBe(3);
    });

    it("findCyclePath returns the active loop path ending back at the repeated node", () => {
        const state = newTraversalState<TestNode>(new Map());
        state.activePath.push("a", "b", "c");
        state.activeIndexByName.set("a", 0);
        state.activeIndexByName.set("b", 1);
        state.activeIndexByName.set("c", 2);

        expect(findCyclePath("b", state)).toEqual(["b", "c", "b"]);
    });

    it("buildGenerations sorts nodes within each generation by name", () => {
        const z = node("z");
        const a = node("a");
        const root = node("root");

        const state = newTraversalState<TestNode>(
            new Map([
                ["z", z],
                ["a", a],
                ["root", root],
            ])
        );
        state.generationByName.set("z", 0);
        state.generationByName.set("a", 0);
        state.generationByName.set("root", 1);

        expect(names(buildGenerations(state, graph))).toEqual([
            ["a", "z"],
            ["root"],
        ]);
    });

    it("makeCycleIssue creates the expected structured issue", () => {
        expect(makeCycleIssue("package.dependencies", ["a", "b", "a"])).toEqual({
            kind: "graphCycle",
            message: "Cycle detected in package.dependencies: a -> b -> a",
            context: {
                purpose: "package.dependencies",
                cyclePath: ["a", "b", "a"],
            },
        });
    });

    it("makeDuplicateGraphNameIssue creates the expected structured issue", () => {
        expect(makeDuplicateGraphNameIssue("package.dependencies", "dup")).toEqual({
            kind: "duplicateGraphName",
            message: "Duplicate graph name detected in package.dependencies: dup",
            context: {
                purpose: "package.dependencies",
                duplicateName: "dup",
            },
        });
    });

    it("makeMissingGraphDependencyIssue creates the expected structured issue", () => {
        expect(makeMissingGraphDependencyIssue("package.dependencies", "a", "missing")).toEqual({
            kind: "missingGraphDependency",
            message: "Missing graph dependency in package.dependencies: 'a' depends on 'missing' but it is not present",
            context: {
                purpose: "package.dependencies",
                nodeName: "a",
                missingDependencyName: "missing",
            },
        });
    });

    it("reports only the loop segment when a cycle starts mid-stack", () => {
        const {observability} = recordingObservability();

        const a = node("a", ["b"]);
        const b = node("b", ["c"]);
        const c = node("c", ["d"]);
        const d = node("d", ["b"]);

        const result = topologicalGenerations("building.execution.plan", [a, b, c, d], graph, observability);

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "graphCycle",
                message: "Cycle detected in building.execution.plan: b -> c -> d -> b",
                context: {
                    purpose: "building.execution.plan",
                    cyclePath: ["b", "c", "d", "b"],
                }
            }
        ]);
    });

    it("records duration and cycle metric when traversal fails with a cycle", () => {
        let now = 500;
        const timeService = {now: () => now++};
        const {observability, counts, durations, debug} = recordingObservability({}, "test-correlation-id", timeService);

        const a = node("a", ["b"]);
        const b = node("b", ["a"]);

        const result = topologicalGenerations("building.execution.plan", [a, b], graph, observability);

        expect(errorsOrThrow(result)).toEqual([
            {
                kind: "graphCycle",
                message: "Cycle detected in building.execution.plan: a -> b -> a",
                context: {
                    purpose: "building.execution.plan",
                    cyclePath: ["a", "b", "a"],
                }
            }
        ]);

        expect(counts).toEqual(
            expect.arrayContaining([
                runMetricName("building.execution.plan"),
                cycleMetricName("building.execution.plan"),
            ])
        );
        expect(durations).toEqual([
            {
                name: durationMetricName("building.execution.plan"),
                durationMs: 1,
            },
        ]);
        expect(debug.some(d =>
            d.context === topologicalGenerationsContext("building.execution.plan") &&
            d.msg[0] === "cycleDetected"
        )).toBe(true);
    });

    it("returns the same generations regardless of root order", () => {
        const {observability: observability1} = recordingObservability();
        const {observability: observability2} = recordingObservability();

        const c = node("c");
        const b = node("b");
        const left = node("left", ["c"]);
        const right = node("right", ["b"]);
        const rootA = node("rootA", ["left"]);
        const rootB = node("rootB", ["right"]);

        const allNodes = [rootA, rootB, left, right, b, c];

        const result1 = topologicalGenerations("package.dependencies", allNodes, graph, observability1);
        const result2 = topologicalGenerations("package.dependencies", [rootB, rootA, left, right, b, c], graph, observability2);

        expect(names(valueOrThrow(result1))).toEqual([
            ["b", "c"],
            ["left", "right"],
            ["rootA", "rootB"],
        ]);
        expect(names(valueOrThrow(result2))).toEqual([
            ["b", "c"],
            ["left", "right"],
            ["rootA", "rootB"],
        ]);
    });
});