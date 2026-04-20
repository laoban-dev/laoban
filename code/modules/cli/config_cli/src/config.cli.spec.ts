import {laobanConfigCommands, loadConfig, type LaobanConfigCliContext} from "./config.cli";
import {loadLaobanConfig} from "@laoban/laoban_config";
import {isCliCommand, isCliGroup} from "@laoban/clidsl";

jest.mock("@laoban/laoban_config", () => ({
    loadLaobanConfig: jest.fn()
}));

jest.mock("@laoban/errors", () => ({
    mapErrorsOr: (value: any, fn: (x: any) => any) => value?.ok ? {ok: true, value: fn(value.value)} : value
}));

const mockedLoadLaobanConfig = loadLaobanConfig as jest.MockedFunction<typeof loadLaobanConfig>;

function makeContext(): LaobanConfigCliContext {
    return {
        cwd: "/workspace/project",
        fileOps: {} as any,
        loadLaobanFileConfig: {} as any,
        observability: {
            logger: jest.fn()
        } as any
    };
}

function ok<T>(value: T) {
    return {ok: true, value};
}

function err<T = never>(error: any) {
    return {ok: false, error} as any as T;
}

describe("laoban config commands", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("loadConfig wires loadLaobanConfig correctly", async () => {
        const context = makeContext();
        mockedLoadLaobanConfig.mockResolvedValue(ok({anything: "goes"} as any));

        await loadConfig(context);

        expect(mockedLoadLaobanConfig).toHaveBeenCalledWith(
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
        const context = makeContext();
        const config = {name: "demo"};
        mockedLoadLaobanConfig.mockResolvedValue(ok({
            config,
            configDirectory: "/workspace/project",
            configFile: "/workspace/project/laoban.json",
            loadedFiles: ["/workspace/project/laoban.json"]
        } as any));

        if (!isCliGroup(laobanConfigCommands)) throw new Error("Expected root to be a group");

        const configGroup = laobanConfigCommands.children.config;
        if (!isCliGroup(configGroup)) throw new Error("Expected config to be a group");

        const view = configGroup.children.view;
        if (!isCliCommand(view)) throw new Error("Expected view to be a command");

        const result = await view.execute({}, context);

        expect(result).toEqual(ok(config));
        expect(context.observability.logger).not.toHaveBeenCalled();
    });

    it("config list returns source details and logs them", async () => {
        const context = makeContext();
        mockedLoadLaobanConfig.mockResolvedValue(ok({
            config: {name: "demo"},
            configDirectory: "/workspace/project",
            configFile: "/workspace/project/laoban.json",
            loadedFiles: [
                "/workspace/project/laoban.json",
                "/workspace/shared/laoban.json"
            ]
        } as any));

        const configGroup = laobanConfigCommands.children.config;
        if (!isCliGroup(configGroup)) throw new Error("Expected config group");

        const list = configGroup.children.list;
        if (!isCliCommand(list)) throw new Error("Expected list command");

        const result = await list.execute({}, context);

        const expected = {
            directory: "/workspace/project",
            mainFile: "/workspace/project/laoban.json",
            files: [
                "/workspace/project/laoban.json",
                "/workspace/shared/laoban.json"
            ]
        };

        expect(result).toEqual(ok(expected));
        expect(context.observability.logger).toHaveBeenCalledWith(
            "info",
            JSON.stringify(expected, null, 2)
        );
    });

    it("config view propagates errors unchanged", async () => {
        const context = makeContext();
        const failure = err({message: "boom"});
        mockedLoadLaobanConfig.mockResolvedValue(failure as any);

        const configGroup = laobanConfigCommands.children.config;
        if (!isCliGroup(configGroup)) throw new Error("Expected config group");

        const view = configGroup.children.view;
        if (!isCliCommand(view)) throw new Error("Expected view command");

        const result = await view.execute({}, context);

        expect(result).toBe(failure);
    });
});