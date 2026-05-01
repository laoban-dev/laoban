import {value, errors} from "@laoban/errors";
import {laobanConfigCommands, type LaobanConfigCliContext, loadConfig} from "./config.cli";
import {isCliCommand, isCliGroup} from "@laoban/clidsl";
import {LoadConfigFn} from "@laoban/laoban_config";
import {
    defaultObservabilityContext,
    makeObservability,
    type Observability
} from "@laoban/observability";
import {OsOps} from "@laoban/os";

type TestObs = {
    observability: Observability
    write: jest.Mock
}

function makeTestObservability(): TestObs {
    const write = jest.fn();

    return {
        write,
        observability: makeObservability({
            context: {
                ...defaultObservabilityContext("test-correlation-id"),
                timeService: {now: () => 0}
            },
            target: {write},
            countMetric: jest.fn(),
            durationMetric: jest.fn()
        })
    };
}

function makeContext(loadConfig: LoadConfigFn, testObs = makeTestObservability()): LaobanConfigCliContext & {testObs: TestObs} {
    return {
        cwd: "/workspace/project",
        osOps: {cpuCount: () => 10} as OsOps,
        fileOps: {} as any,
        loadLaobanFileConfig: {} as any,
        loadLaobanConfig: loadConfig,
        observability: testObs.observability,
        testObs
    };
}

function getConfigGroup() {
    if (!isCliGroup(laobanConfigCommands)) throw new Error("Expected config commands to be a group");
    return laobanConfigCommands;
}

function getViewCommand() {
    const view = getConfigGroup().children.view;
    if (!isCliCommand(view)) throw new Error("Expected view command");
    return view;
}

function getListCommand() {
    const list = getConfigGroup().children.list;
    if (!isCliCommand(list)) throw new Error("Expected list command");
    return list;
}

describe("laoban config commands", () => {
    it("loadConfig delegates to context.loadLaobanConfig with the expected arguments", async () => {
        const result = value({anything: "goes"} as any);
        const loadLaobanConfig = jest.fn<ReturnType<LoadConfigFn>, Parameters<LoadConfigFn>>(
            async () => result
        );

        const context = makeContext(loadLaobanConfig);

        const actual = await loadConfig(context);

        expect(actual).toBe(result);
        expect(loadLaobanConfig).toHaveBeenCalledWith(
            {
                osOps: context.osOps,
                fileOps: context.fileOps,
                observability: context.observability,
                markerFileName: "laoban.json",
                loadTextConfig: context.loadLaobanFileConfig
            },
            context.cwd
        );
    });

    it("config view returns the effective config", async () => {
        const config = {name: "demo"};
        const loadLaobanConfig: LoadConfigFn = async (_params, _cwd) =>
            value({
                config,
                configDirectory: "/workspace/project",
                configFile: "/workspace/project/laoban.json",
                loadedFiles: ["/workspace/project/laoban.json"]
            } as any);

        const context = makeContext(loadLaobanConfig);

        const result = await getViewCommand().execute({}, context);

        expect(result).toEqual(value(config));
        expect(context.testObs.write).not.toHaveBeenCalled();
    });

    it("config list returns source details and logs them", async () => {
        const loadLaobanConfig: LoadConfigFn = async (_params, _cwd) =>
            value({
                config: {name: "demo"},
                configDirectory: "/workspace/project",
                configFile: "/workspace/project/laoban.json",
                loadedFiles: [
                    "/workspace/project/laoban.json",
                    "/workspace/shared/laoban.json"
                ]
            } as any);

        const context = makeContext(loadLaobanConfig);

        const result = await getListCommand().execute({}, context);

        const expected = {
            directory: "/workspace/project",
            mainFile: "/workspace/project/laoban.json",
            files: [
                "/workspace/project/laoban.json",
                "/workspace/shared/laoban.json"
            ]
        };

        expect(result).toEqual(value(expected));
        expect(context.testObs.write).toHaveBeenCalledWith(
            `00:00:00 INFO ${JSON.stringify(expected, null, 2)}\n`
        );
    });

    it("config view propagates errors unchanged", async () => {
        const failure = errors({
            kind: "loader",
            severity: "error",
            context: ["config"],
            message: "boom"
        } as any);

        const loadLaobanConfig: LoadConfigFn = async (_params, _cwd) => failure;
        const context = makeContext(loadLaobanConfig);

        const result = await getViewCommand().execute({}, context);

        expect(result).toBe(failure);
    });

    it("config list propagates errors unchanged and does not log", async () => {
        const failure = errors({
            kind: "loader",
            severity: "error",
            context: ["config"],
            message: "boom"
        } as any);

        const loadLaobanConfig: LoadConfigFn = async (_params, _cwd) => failure;
        const context = makeContext(loadLaobanConfig);

        const result = await getListCommand().execute({}, context);

        expect(result).toBe(failure);
        expect(context.testObs.write).not.toHaveBeenCalled();
    });

    it("has view and list commands", () => {
        const configGroup = getConfigGroup();

        expect(isCliCommand(configGroup.children.view)).toBe(true);
        expect(isCliCommand(configGroup.children.list)).toBe(true);
    });
});