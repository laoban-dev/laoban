import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import * as os from "os";
import * as path from "path";

import { recordingObservability } from "@laoban/observability";

import { fileOpsNode } from "./fileops.node";

describe("fileOpsNode smoke test", () => {
    let rootDir: string;

    beforeEach(async () => {
        rootDir = await mkdtemp(path.join(os.tmpdir(), "fileops-node-"));
    });

    afterEach(async () => {
        await rm(rootDir, { recursive: true, force: true });
    });

    it("loads text from a real file and records file-load observability", async () => {
        const recorded = recordingObservability<"load" | "findContainingDirectory">();
        const fileOps = fileOpsNode();

        const fileName = path.join(rootDir, "hello.txt");
        await writeFile(fileName, "hello world", "utf8");

        const result = await fileOps.loadText(fileName, {
            observability: recorded.observability,
        });

        expect(result).toEqual({ value: "hello world" });
        expect(recorded.counts).toEqual(["fileops.load.file.success"]);
        expect(recorded.durations).toHaveLength(1);
        expect(recorded.durations[0].name).toBe("fileops.load.file.ms");
        expect(typeof recorded.durations[0].durationMs).toBe("number");
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });

    it("finds the containing directory for a real marker file and records existence-check observability", async () => {
        const recorded = recordingObservability<"load" | "findContainingDirectory">();
        const fileOps = fileOpsNode();

        const workspaceDir = path.join(rootDir, "workspace");
        const nestedDir = path.join(workspaceDir, "packages", "a", "src");
        const markerFile = path.join(workspaceDir, "laoban.json");

        await mkdir(nestedDir, { recursive: true });
        await writeFile(markerFile, "{}", "utf8");

        const result = await fileOps.findContainingDirectory(
            nestedDir,
            "laoban.json",
            {
                observability: recorded.observability,
            },
        );

        expect(result).toEqual({ value: workspaceDir });
        expect(recorded.counts).toEqual([
            "fileops.findContainingDirectory.fileExists.notFound",
            "fileops.findContainingDirectory.fileExists.notFound",
            "fileops.findContainingDirectory.fileExists.notFound",
            "fileops.findContainingDirectory.fileExists.success",
        ]);
        expect(recorded.durations).toHaveLength(4);
        for (const d of recorded.durations) {
            expect(d.name).toBe("fileops.findContainingDirectory.fileExists.ms");
            expect(typeof d.durationMs).toBe("number");
        }
        expect(recorded.debug).toEqual([]);
        expect(recorded.logs).toEqual([]);
    });
});