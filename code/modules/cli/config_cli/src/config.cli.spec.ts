import {value, errors} from "@laoban/errors";
import {laobanConfigCommands, type LaobanConfigCliContext, loadConfig,} from "./config.cli";
import {isCliCommand, isCliGroup, isCliRoot} from "@laoban/clidsl";
import {LoadConfigFn, loadLaobanConfig} from "@laoban/laoban_config";

function makeContext(loadConfig: LoadConfigFn): LaobanConfigCliContext {
    return {
        cwd: "/workspace/project",
        fileOps: {} as any,
        loadLaobanFileConfig: {} as any,
        loadLaobanConfig: loadConfig,
        observability: {
            logger: jest.fn()
        } as any
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
        expect(context.observability.logger).not.toHaveBeenCalled();
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
        expect(context.observability.logger).toHaveBeenCalledWith(
            "info",
            JSON.stringify(expected, null, 2)
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
        expect(context.observability.logger).not.toHaveBeenCalled();
    });

    it("has view and list commands", () => {
        const configGroup = getConfigGroup();

        expect(isCliCommand(configGroup.children.view)).toBe(true);
        expect(isCliCommand(configGroup.children.list)).toBe(true);
    });
});