import {errorsOrThrow, valueOrThrow} from "@laoban/errors";
import {recordingObservability} from "@laoban/observability";
import {
    buildGenerations,
    calculateGenerationFromDependencies,
    cycleMetricName,
    durationMetricName,
    findCyclePath,
    makeCycleIssue,
    makeDuplicateGraphNameIssue,
    NameAndDependsOn,
    newTraversalState,
    runMetricName,
    topologicalGenerations,
    topologicalGenerationsContext,
    topologicalGenerationsVisitContext,
    validateUniqueNames,
} from "./topological.sort";

type TestNode = {
    name: string;
    dependsOn?: TestNode[];
};

const node = (name: string, dependsOn: TestNode[] = []): TestNode => ({name, dependsOn});

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
        const b = node("b", [c]);
        const a = node("a", [b]);

        const result = topologicalGenerations("package.dependencies", [a], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([
            ["c"],
            ["b"],
            ["a"],
        ]);
    });

    it("orders a diamond with shared dependency only once", () => {
        const {observability} = recordingObservability();
        const d = node("d");
        const b = node("b", [d]);
        const c = node("c", [d]);
        const a = node("a", [b, c]);

        const result = topologicalGenerations("package.dependencies", [a], graph, observability);

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
        const root1 = node("root1", [z]);
        const root2 = node("root2", [a]);

        const result = topologicalGenerations("package.dependencies", [root1, root2], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([
            ["a", "z"],
            ["root1", "root2"],
        ]);
    });

    it("detects a cycle and returns the named cycle path", () => {
        const {observability, counts, debug} = recordingObservability();

        const a: TestNode = {name: "a", dependsOn: []};
        const b: TestNode = {name: "b", dependsOn: []};
        const c: TestNode = {name: "c", dependsOn: []};

        a.dependsOn = [b];
        b.dependsOn = [c];
        c.dependsOn = [a];

        const result = topologicalGenerations("building.execution.plan", [a], graph, observability);
        const issue = errorsOrThrow(result)[0];

        expect(issue.kind).toBe("graphCycle");
        expect(issue.message).toBe("Cycle detected in building.execution.plan: a -> b -> c -> a");
        expect(issue.context).toEqual({
            purpose: "building.execution.plan",
            cyclePath: ["a", "b", "c", "a"],
        });

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
        const root = node("root", [sharedName1, sharedName2]);

        const result = topologicalGenerations("package.dependencies", [root], graph, observability);
        const issue = errorsOrThrow(result)[0];

        expect(issue.kind).toBe("duplicateGraphName");
        expect(issue.message).toBe("Duplicate graph name detected in package.dependencies: dup");
        expect(issue.context).toEqual({
            purpose: "package.dependencies",
            duplicateName: "dup",
        });
    });

    it("allows the same node instance to be reached more than once", () => {
        const {observability} = recordingObservability();

        const shared = node("shared");
        const left = node("left", [shared]);
        const right = node("right", [shared]);
        const root = node("root", [left, right]);

        const result = topologicalGenerations("package.dependencies", [root], graph, observability);

        expect(names(valueOrThrow(result))).toEqual([
            ["shared"],
            ["left", "right"],
            ["root"],
        ]);
    });

    it("writes visit debug records with the purpose-based visit context", () => {
        const {observability, debug} = recordingObservability();
        const b = node("b");
        const a = node("a", [b]);

        const result = topologicalGenerations("package.dependencies", [a], graph, observability);

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
});

describe("validateUniqueNames", () => {
    it("returns value when all names are unique", () => {
        const {observability} = recordingObservability();
        const c = node("c");
        const b = node("b", [c]);
        const a = node("a", [b]);

        const result = validateUniqueNames("package.dependencies", [a], graph, observability);

        expect(valueOrThrow(result)).toBeUndefined();
    });

    it("returns an error for duplicate names across different node instances", () => {
        const {observability} = recordingObservability();
        const x1 = node("x");
        const x2 = node("x");

        const result = validateUniqueNames("package.dependencies", [x1, x2], graph, observability);
        const issue = errorsOrThrow(result)[0];

        expect(issue).toEqual(
            makeDuplicateGraphNameIssue("package.dependencies", "x")
        );
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
        const a = node("a");
        const b = node("b");
        const c = node("c");

        const state = newTraversalState<TestNode>();
        state.activePath.push(a, b, c);
        state.activeIndexByName.set("a", 0);
        state.activeIndexByName.set("b", 1);
        state.activeIndexByName.set("c", 2);

        expect(findCyclePath(b, graph, state)).toEqual(["b", "c", "b"]);
    });

    it("buildGenerations sorts nodes within each generation by name", () => {
        const z = node("z");
        const a = node("a");
        const root = node("root");

        const state = newTraversalState<TestNode>();
        state.generationByName.set("z", 0);
        state.generationByName.set("a", 0);
        state.generationByName.set("root", 1);

        state.nodesByName.set("z", z);
        state.nodesByName.set("a", a);
        state.nodesByName.set("root", root);

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
    it("reports only the loop segment when a cycle starts mid-stack", () => {
        const {observability} = recordingObservability();

        const a: TestNode = {name: "a", dependsOn: []};
        const b: TestNode = {name: "b", dependsOn: []};
        const c: TestNode = {name: "c", dependsOn: []};
        const d: TestNode = {name: "d", dependsOn: []};

        a.dependsOn = [b];
        b.dependsOn = [c];
        c.dependsOn = [d];
        d.dependsOn = [b];

        const result = topologicalGenerations("building.execution.plan", [a], graph, observability);
        const issue = errorsOrThrow(result)[0];

        expect(issue.kind).toBe("graphCycle");
        expect(issue.context).toEqual({
            purpose: "building.execution.plan",
            cyclePath: ["b", "c", "d", "b"],
        });
        expect(issue.message).toBe("Cycle detected in building.execution.plan: b -> c -> d -> b");
    });

    it("finds duplicate names deep in nested dependencies", () => {
        const {observability} = recordingObservability();

        const dup1 = node("dup");
        const dup2 = node("dup");
        const left = node("left", [dup1]);
        const right = node("right", [dup2]);
        const root = node("root", [left, right]);

        const result = topologicalGenerations("package.dependencies", [root], graph, observability);
        const issue = errorsOrThrow(result)[0];

        expect(issue.kind).toBe("duplicateGraphName");
        expect(issue.context).toEqual({
            purpose: "package.dependencies",
            duplicateName: "dup",
        });
        expect(issue.message).toBe("Duplicate graph name detected in package.dependencies: dup");
    });

    it("records duration and cycle metric when traversal fails with a cycle", () => {
        let now = 500;
        const timeService = {now: () => now++};
        const {observability, counts, durations, debug} = recordingObservability({}, "test-correlation-id", timeService);

        const a: TestNode = {name: "a", dependsOn: []};
        const b: TestNode = {name: "b", dependsOn: []};

        a.dependsOn = [b];
        b.dependsOn = [a];

        const result = topologicalGenerations("building.execution.plan", [a], graph, observability);
        const issue = errorsOrThrow(result)[0];

        expect(issue.kind).toBe("graphCycle");
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
        const left = node("left", [c]);
        const right = node("right", [b]);
        const rootA = node("rootA", [left]);
        const rootB = node("rootB", [right]);

        const result1 = topologicalGenerations("package.dependencies", [rootA, rootB], graph, observability1);
        const result2 = topologicalGenerations("package.dependencies", [rootB, rootA], graph, observability2);

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