import {errors, value} from "@laoban/errors";
import {nullObservability} from "@laoban/observability";
import {FileOpIssue, FindContainingDirectoryConfig} from "./fileops";
import {
    findContainingDirectory,
    defaultFindContainingDirectoryDirname,
    defaultFindContainingDirectoryResolvePath,
} from "./find.containing.directory";

const makeIssue = (message: string): FileOpIssue => ({
    kind: "unexpected",
    message,
    severity: "error",
    context: {
        operation: "findContainingDirectory",
    },
});

describe("findContainingDirectory", () => {
    const fileExists = jest.fn();

    const config: FindContainingDirectoryConfig = {
        observability: nullObservability(),
        fileExists,
        dirname: defaultFindContainingDirectoryDirname,
        resolvePath: defaultFindContainingDirectoryResolvePath,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns the starting directory when the marker file exists there", async () => {
        fileExists.mockResolvedValue(value(true));

        const result = await findContainingDirectory(
            "/workspace/project",
            "laoban.json",
            config
        );

        expect(fileExists).toHaveBeenCalledWith("/workspace/project/laoban.json");
        expect(result).toEqual(value("/workspace/project"));
    });

    it("walks up directories until it finds the marker file", async () => {
        fileExists
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(true));

        const result = await findContainingDirectory(
            "/workspace/project/packages/a",
            "laoban.json",
            config
        );

        expect(fileExists).toHaveBeenNthCalledWith(1, "/workspace/project/packages/a/laoban.json");
        expect(fileExists).toHaveBeenNthCalledWith(2, "/workspace/project/packages/laoban.json");
        expect(fileExists).toHaveBeenNthCalledWith(3, "/workspace/project/laoban.json");
        expect(result).toEqual(value("/workspace/project"));
    });

    it("returns notFound when it reaches the filesystem root without finding the marker", async () => {
        fileExists.mockResolvedValue(value(false));

        const result = await findContainingDirectory(
            "/workspace/project",
            "laoban.json",
            config
        );

        expect(result).toEqual({
            errors: [
                {
                    kind: "notFound",
                    message:
                        "Could not find containing directory for marker file [laoban.json] starting at [/workspace/project]",
                    severity: "error",
                    context: {
                        operation: "findContainingDirectory",
                        start: "/workspace/project",
                        markerFileName: "laoban.json",
                    },
                },
            ],
        });
    });

    it("passes through errors from fileExists", async () => {
        const existsError = errors(makeIssue("permission denied"));
        fileExists.mockResolvedValue(existsError);

        const result = await findContainingDirectory(
            "/workspace/project",
            "laoban.json",
            config
        );

        expect(result).toEqual(existsError);
    });

    it("uses custom dirname and resolvePath implementations when provided", async () => {
        const customDirname = jest.fn((dir: string) =>
            dir === "c" ? "b" : dir === "b" ? "a" : dir
        );
        const customResolvePath = jest.fn(() => "c");

        fileExists
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(false))
            .mockResolvedValueOnce(value(true));

        const result = await findContainingDirectory("ignored", "marker.txt", {
            observability: nullObservability(),
            fileExists,
            dirname: customDirname,
            resolvePath: customResolvePath,
        });

        expect(customResolvePath).toHaveBeenCalledWith("ignored");
        expect(fileExists).toHaveBeenNthCalledWith(1, "c/marker.txt");
        expect(fileExists).toHaveBeenNthCalledWith(2, "b/marker.txt");
        expect(fileExists).toHaveBeenNthCalledWith(3, "a/marker.txt");
        expect(result).toEqual(value("a"));
    });
});

describe("default path helpers", () => {
    it("defaultFindContainingDirectoryDirname returns the parent directory", () => {
        expect(defaultFindContainingDirectoryDirname("/a/b/c")).toBe("/a/b");
    });

    it("defaultFindContainingDirectoryResolvePath resolves a path", () => {
        expect(defaultFindContainingDirectoryResolvePath("/a/b")).toBe("/a/b");
    });
});