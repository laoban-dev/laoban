import {
    defaultObservabilityContext,
    makeObservability as makeObs,
    type ModuleName,
    type Observability
} from "@laoban/observability";
import {exampleCli} from "./cli.dsl.example";
import {type CliWalkerConfig, walkCliModel} from "./cli.dsl.walker";

type FakeAcc = {
    root?: {
        name: string;
        description: string;
        version?: string;
    };
    commands: string[];
    groups: Record<string, FakeAcc>;
};

function makeAcc(): FakeAcc {
    return {
        root: undefined,
        commands: [],
        groups: {}
    };
}

function makeObservability(module: ModuleName = undefined): Observability {
    return makeObs({
        context: {
            ...defaultObservabilityContext("test-correlation-id", {}, module),
            timeService: {now: () => 0}
        },
        target: {
            write: jest.fn()
        },
        countMetric: jest.fn(),
        durationMetric: jest.fn()
    });
}

function makeConfig(
    observability: Observability
): CliWalkerConfig<FakeAcc> {
    return {
        observability,
        addRoot: (acc, root) => {
            acc.root = {
                name: root.name,
                description: root.description,
                version: root.version
            };
            return acc;
        },
        addGroup: (parent, name) => {
            const child = makeAcc();
            parent.groups[name] = child;
            return child;
        },
        addLeafCommand: (parent, name) => {
            parent.commands.push(name);
        }
    };
}

describe("walkCliModel smoke test using exampleCli", () => {
    test("walks the example CLI into the expected tree shape", () => {
        const observability = makeObservability();
        const config = makeConfig(observability);
        const acc = makeAcc();

        const result = walkCliModel(acc, exampleCli, config);

        expect(result).toBe(acc);
        expect(acc).toEqual({
            root: {
                name: "laoban",
                description: "Laoban example CLI",
                version: "1.0.0"
            },
            commands: ["build"],
            groups: {
                project: {
                    root: undefined,
                    commands: ["init"],
                    groups: {}
                },
                package: {
                    root: undefined,
                    commands: ["publish", "version"],
                    groups: {}
                }
            }
        });
    });
});