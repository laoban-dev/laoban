import {type BasicCliContext, CliGroup, type CliModel, defineCommand, group, root} from "@laoban/clidsl";
import {FileOps, LoadTextConfig} from "@laoban/files";

export type LaobanDebugContext = "cli";

export interface LaobanConfigCliContext extends BasicCliContext {
    cwd: string;
    fileOps: FileOps
    loadLaobanFileConfig: LoadTextConfig
}

const packageListCommand = defineCommand<{}, LaobanConfigCliContext>()({
    description: "List packages",
    positionals: {},
    options: {},
    execute: async (_values, context) => {
        context.observability.logger("info", "package list");
        console.log("package list");
        return {};
    },
});

const packageViewCommand = defineCommand<{ name: string }, LaobanConfigCliContext>()({
    description: "View one package.details.json",
    positionals: {
        name: {
            description: "Package name",
            type: "string",
            required: true
        }
    },
    options: {},
    execute: async (values, _context) => {
        console.log("package view", values.name);
        return {};
    },
});

const packageSortCommand = defineCommand<{}, LaobanConfigCliContext>()({
    description: "Show packages in topological order",
    positionals: {},
    options: {},
    execute: async (_values, _context) => {
        console.log("package sort");
        return {};
    },
});

export const laobanPackageCommands: CliGroup<LaobanConfigCliContext> =
    group("Package commands", {
        list: packageListCommand,
        view: packageViewCommand,
        sort: packageSortCommand,
    })
