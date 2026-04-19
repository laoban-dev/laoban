import {
    errorsOrThrow,
    valueOrThrow,
} from "@laoban/errors";
import { nullObservability } from "@laoban/observability";
import type { LaobanConfigLoadArea } from "./laoban.config";
import type { DirectoryName, Filename, FileOps } from "@laoban/files";

import { loadLaobanConfig } from "./laoban.config.loader";

describe("loadLaobanConfig", () => {
    const observability = nullObservability<LaobanConfigLoadArea>();

    function makeFileOps(
        foundDirectory: DirectoryName,
        files: Record<string, string>
    ): FileOps {
        return {
            findContainingDirectory: async (_start: DirectoryName, _markerFileName: Filename) => ({
                value: foundDirectory,
            }),
            loadText: async (filename: Filename) => {
                const text = files[filename];
                return text === undefined
                    ? { errors: [{ kind: "loadText", message: `File not found: ${filename}` }] }
                    : { value: text };
            },
        } as FileOps;
    }

    it("loads and normalises a simple config", async () => {
        const fileOps = makeFileOps("/workspace", {
            "/workspace/laoban.json": JSON.stringify({
                packageManager: "pnpm",
                scripts: {
                    build: {
                        description: "builds the project",
                        commands: ["pnpm build"],
                    },
                },
            }),
        });

        const result = await loadLaobanConfig(
            {
                fileOps,
                observability,
                markerFileName: "laoban.json",
            },
            "/workspace/src"
        );

        const loaded = valueOrThrow(result);

        expect(loaded.config).toEqual({
            packageManager: "pnpm",
            versionFile: "version.txt",
            parents: [],
            properties: {},
            templates: {},
            defaultEnv: {},
            scripts: {
                build: {
                    description: "builds the project",
                    commands: [
                        {
                            command: "pnpm build",
                            status: false,
                        },
                    ],
                    inLinksOrder: false,
                    showShell: false,
                    commandArgs: {},
                    env: {},
                },
            },
            skipDirectories: [".git", "node_modules"],
        });
        expect(loaded.configDirectory).toBe("/workspace");
        expect(loaded.configFile).toBe("/workspace/laoban.json");
        expect(loaded.loadedFiles).toEqual(["/workspace/laoban.json"]);
    });

    it("includes diagnosticContext on parse errors", async () => {
        const fileOps = makeFileOps("/workspace", {
            "/workspace/laoban.json": "{ not valid json",
        });

        const result = await loadLaobanConfig(
            {
                fileOps,
                observability,
                markerFileName: "laoban.json",
            },
            "/workspace"
        );

        const errs = errorsOrThrow(result);
        expect(errs[0].diagnosticContext).toEqual({
            currentFile: "/workspace/laoban.json",
            loadPath: ["/workspace/laoban.json"],
        });
    });

    it("includes diagnosticContext on weak validation errors in a parent", async () => {
        const fileOps = makeFileOps("/workspace", {
            "/workspace/laoban.json": JSON.stringify({
                parents: ["/shared/base.laoban.json"],
            }),
            "/shared/base.laoban.json": JSON.stringify({
                parents: [123],
            }),
        });

        const result = await loadLaobanConfig(
            {
                fileOps,
                observability,
                markerFileName: "laoban.json",
            },
            "/workspace"
        );

        const errs = errorsOrThrow(result);
        expect(errs[0].diagnosticContext).toEqual({
            currentFile: "/shared/base.laoban.json",
            loadPath: [
                "/workspace/laoban.json",
                "/shared/base.laoban.json",
            ],
        });
    });

    it("includes diagnosticContext on final validation errors", async () => {
        const fileOps = makeFileOps("/workspace", {
            "/workspace/laoban.json": JSON.stringify({
                scripts: {
                    build: {
                        description: "builds the project",
                        commands: ["pnpm build"],
                        showShell: "yes",
                    },
                },
            }),
        });

        const result = await loadLaobanConfig(
            {
                fileOps,
                observability,
                markerFileName: "laoban.json",
            },
            "/workspace"
        );

        const errs = errorsOrThrow(result);
        expect(errs[0].diagnosticContext).toEqual({
            currentFile: "/workspace/laoban.json",
            loadPath: ["/workspace/laoban.json"],
        });
    });

    it("loads parents and merges them before the local config", async () => {
        const fileOps = makeFileOps("/workspace", {
            "/workspace/laoban.json": JSON.stringify({
                parents: ["/shared/base.laoban.json"],
                properties: { app: "laoban" },
                scripts: {
                    build: {
                        description: "builds the project",
                        commands: ["yarn build"],
                    },
                },
            }),
            "/shared/base.laoban.json": JSON.stringify({
                packageManager: "yarn",
                properties: { shared: "yes" },
                templates: { typescript: "./templates/typescript" },
                skipDirectories: ["dist"],
            }),
        });

        const result = await loadLaobanConfig(
            {
                fileOps,
                observability,
                markerFileName: "laoban.json",
            },
            "/workspace"
        );

        const loaded = valueOrThrow(result);

        expect(loaded.config.packageManager).toBe("yarn");
        expect(loaded.config.properties).toEqual({
            shared: "yes",
            app: "laoban",
        });
        expect(loaded.config.templates).toEqual({
            typescript: "./templates/typescript",
        });
        expect(loaded.config.scripts).toEqual({
            build: {
                description: "builds the project",
                commands: [
                    {
                        command: "yarn build",
                        status: false,
                    },
                ],
                inLinksOrder: false,
                showShell: false,
                commandArgs: {},
                env: {},
            },
        });
        expect(loaded.config.skipDirectories).toEqual([
            ".git",
            "node_modules",
            "dist",
        ]);
        expect(loaded.loadedFiles).toEqual([
            "/shared/base.laoban.json",
            "/workspace/laoban.json",
        ]);
    });
});