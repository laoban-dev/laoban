import {isCliCommand, isCliGroup} from "@laoban/clidsl";
import {laobanPackageCommands, type LaobanConfigCliContext} from "./package.cli";

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

function getPackageGroup() {
    if (!isCliGroup(laobanPackageCommands)) throw new Error("Expected package group");
    return laobanPackageCommands;
}

function getListCommand() {
    const list = getPackageGroup().children.list;
    if (!isCliCommand(list)) throw new Error("Expected list command");
    return list;
}

function getViewCommand() {
    const view = getPackageGroup().children.view;
    if (!isCliCommand(view)) throw new Error("Expected view command");
    return view;
}

function getSortCommand() {
    const sort = getPackageGroup().children.sort;
    if (!isCliCommand(sort)) throw new Error("Expected sort command");
    return sort;
}

describe("package commands", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("has list, view and sort commands", () => {
        const group = getPackageGroup();

        expect(isCliCommand(group.children.list)).toBe(true);
        expect(isCliCommand(group.children.view)).toBe(true);
        expect(isCliCommand(group.children.sort)).toBe(true);
    });

    it("list logs through observability and console", async () => {
        const context = makeContext();

        const result = await getListCommand().execute({}, context);

        expect(result).toEqual({});
        expect(context.observability.logger).toHaveBeenCalledWith("info", "package list");
        expect(console.log).toHaveBeenCalledWith("package list");
    });

    it("view logs the package name to console", async () => {
        const context = makeContext();

        const result = await getViewCommand().execute({name: "my-package"}, context);

        expect(result).toEqual({});
        expect(context.observability.logger).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith("package view", "my-package");
    });

    it("sort logs to console", async () => {
        const context = makeContext();

        const result = await getSortCommand().execute({}, context);

        expect(result).toEqual({});
        expect(context.observability.logger).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith("package sort");
    });

    it("view requires a name positional in the model", () => {
        const command = getViewCommand();

        expect(command.positionals.name).toEqual({
            description: "Package name",
            type: "string",
            required: true
        });
    });

    it("list and sort have no positionals", () => {
        expect(getListCommand().positionals).toEqual({});
        expect(getSortCommand().positionals).toEqual({});
    });
});