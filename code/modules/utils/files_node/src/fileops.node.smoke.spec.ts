import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

import { value } from "@laoban/errors";
import { nodeFileOpsDefaults } from "./fileops.node.defaults";
import { fileOps } from "./fileops.node";

describe("node file ops smoke tests", () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "laoban-fileops-"));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("loadFile reads a real file", async () => {
        const filename = path.join(tempDir, "hello.txt");
        await fs.writeFile(filename, "hello world", "utf8");

        const result = await nodeFileOpsDefaults.loadText.infrastructure.loadFile(filename);

        expect(result).toEqual(value("hello world"));
    });

    it("findContainingDirectory finds a real marker file", async () => {
        const workspaceDir = path.join(tempDir, "workspace");
        const nestedDir = path.join(workspaceDir, "packages", "a");

        await fs.mkdir(nestedDir, { recursive: true });
        await fs.writeFile(path.join(workspaceDir, "laoban.json"), "{}", "utf8");

        const result =
            await nodeFileOpsDefaults.findContainingDirectory.infrastructure.fileExists(
                path.join(workspaceDir, "laoban.json"),
            );

        expect(result).toEqual(value(true));
    });

    it("assembled fileOps loadText reads a real file", async () => {
        const ops = fileOps(nodeFileOpsDefaults);
        const filename = path.join(tempDir, "readme.txt");
        await fs.writeFile(filename, "smoke test", "utf8");

        const result = await ops.loadText(filename);

        expect(result).toEqual(value("smoke test"));
    });

    it("assembled fileOps findContainingDirectory finds the workspace root", async () => {
        const ops = fileOps(nodeFileOpsDefaults);
        const workspaceDir = path.join(tempDir, "workspace");
        const nestedDir = path.join(workspaceDir, "packages", "project");

        await fs.mkdir(nestedDir, { recursive: true });
        await fs.writeFile(path.join(workspaceDir, "laoban.json"), "{}", "utf8");

        const result = await ops.findContainingDirectory(nestedDir, "laoban.json");

        expect(result).toEqual(value(workspaceDir));
    });
});