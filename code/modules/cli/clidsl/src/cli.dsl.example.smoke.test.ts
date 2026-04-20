import type { Observability } from "@laoban/observability";
import { exampleCli } from "./cli.dsl.example";
import {
    type CliWalkerConfig,
    type CliWalkerDebugContext,
    walkCliModel
} from "./cli.dsl.walker";

type FakeAcc = {
    commands: string[];
    groups: Record<string, FakeAcc>;
};

function makeAcc(): FakeAcc {
    return {
        commands: [],
        groups: {}
    };
}

function makeObservability(): Observability<CliWalkerDebugContext> {
    return {
        correlationId: "test-correlation-id",
        logger: jest.fn(),
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
        debugLevels: {},
        timeService: { now: () => 0 }
    };
}

function makeConfig(
    observability: Observability<CliWalkerDebugContext>
): CliWalkerConfig<FakeAcc> {
    return {
        observability,
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
            commands: ["build"],
            groups: {
                project: {
                    commands: ["init"],
                    groups: {}
                },
                package: {
                    commands: ["publish", "version"],
                    groups: {}
                }
            }
        });
    });
});