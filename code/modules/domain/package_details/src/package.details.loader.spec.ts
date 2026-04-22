import {isErrors} from "@laoban/errors";
import {type FileOps, PathOps} from "@laoban/files";
import {type LoadedLaobanConfig} from "@laoban/laoban_config";
import {recordingObservability} from "@laoban/observability";
import {type ValidationIssue} from "@laoban/validation";
import {loadPackages, packageDetailsFileName} from "./package.details.loader";
import {nodePathOps} from "@laoban/files_node";

function makeLoadedLaobanConfig(configDirectory = "/workspace"): LoadedLaobanConfig {
    return {
        config: {} as any,
        configFile: `${configDirectory}/laoban.json`,
        configDirectory,
        loadedFiles: [`${configDirectory}/laoban.json`]
    };
}

type MockFileOps = {
    findContainingDirectory: jest.MockedFunction<FileOps["findContainingDirectory"]>;
    findAllByNameUnder: jest.MockedFunction<FileOps["findAllByNameUnder"]>;
    loadText: jest.MockedFunction<FileOps["loadText"]>;
    pathOps: PathOps
};

function makeFileOps(overrides?: Partial<MockFileOps>): MockFileOps {
    return {
        findContainingDirectory: jest.fn() as jest.MockedFunction<FileOps["findContainingDirectory"]>,
        findAllByNameUnder: jest.fn() as jest.MockedFunction<FileOps["findAllByNameUnder"]>,
        loadText: jest.fn() as jest.MockedFunction<FileOps["loadText"]>,
        ...overrides,
        pathOps: nodePathOps
    };
}

function isValidationIssue(issue: unknown): issue is ValidationIssue {
    return typeof issue === "object" && issue !== null && "kind" in issue && (issue as any).kind === "validation";
}

function hasPackageFileContext(issue: unknown, packageFile: string): boolean {
    return isValidationIssue(issue) && Array.isArray(issue.context) && issue.context[0] === packageFile;
}

async function loadWith(fileOps: MockFileOps) {
    const recording = recordingObservability();
    const result = await loadPackages(
        makeLoadedLaobanConfig(),
        {fileOps, observability: recording.observability}
    );
    return {result, recording};
}

describe("loadPackages", () => {
    it("returns an issue when package discovery fails", async () => {
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                errors: [{
                    kind: "file.not.found",
                    message: "No such directory"
                }],
                warnings: []
            })
        });

        const {result} = await loadWith(fileOps);

        expect(fileOps.findAllByNameUnder).toHaveBeenCalledWith(
            "/workspace",
            packageDetailsFileName
        );

        expect(isErrors(result)).toBe(true);
        if (!isErrors(result)) throw new Error("Expected errors");

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
            kind: "findPackageDetailsFailed",
            message: `Could not search for ${packageDetailsFileName} files under /workspace`,
            context: {
                configDirectory: "/workspace",
                markerFileName: packageDetailsFileName
            }
        });
    });

    it("returns an issue when a package file cannot be loaded", async () => {
        const packageFile = "/workspace/a/package.details.json";
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [packageFile],
                warnings: []
            }),
            loadText: jest.fn().mockResolvedValue({
                errors: [{
                    kind: "file.not.found",
                    message: "Cannot load file"
                }],
                warnings: []
            })
        });

        const {result} = await loadWith(fileOps);

        expect(fileOps.findAllByNameUnder).toHaveBeenCalledWith(
            "/workspace",
            packageDetailsFileName
        );
        expect(fileOps.loadText).toHaveBeenCalledWith(packageFile);

        expect(isErrors(result)).toBe(true);
        if (!isErrors(result)) throw new Error("Expected errors");

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
            kind: "loadPackageDetailsFailed",
            message: `Could not load package details file ${packageFile}`,
            context: {
                packageFile
            }
        });
    });

    it("returns an issue when a package file contains invalid JSON text", async () => {
        const packageFile = "/workspace/a/package.details.json";
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [packageFile],
                warnings: []
            }),
            loadText: jest.fn().mockResolvedValue({
                value: "{ this is not valid json",
                warnings: []
            })
        });

        const {result} = await loadWith(fileOps);

        expect(fileOps.loadText).toHaveBeenCalledWith(packageFile);

        expect(isErrors(result)).toBe(true);
        if (!isErrors(result)) throw new Error("Expected errors");

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
            kind: "parsePackageDetailsFailed",
            message: expect.stringContaining(`Could not parse package details JSON in ${packageFile}`),
            context: {
                packageFile
            }
        });
    });

    it("returns all validation errors for one malformed package file", async () => {
        const packageFile = "/workspace/a/package.details.json";
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [packageFile],
                warnings: []
            }),
            loadText: jest.fn().mockResolvedValue({
                value: JSON.stringify({
                    name: "",
                    template: 123,
                    description: 456
                }),
                warnings: []
            })
        });

        const {result} = await loadWith(fileOps);

        expect(isErrors(result)).toBe(true);
        if (!isErrors(result)) throw new Error("Expected errors");

        const validationIssues = result.errors.filter(isValidationIssue);
        expect(validationIssues.length).toBeGreaterThanOrEqual(3);
        expect(validationIssues.every(issue => hasPackageFileContext(issue, packageFile))).toBe(true);
    });

    it("returns validation errors from multiple malformed package files", async () => {
        const packageFileA = "/workspace/a/package.details.json";
        const packageFileB = "/workspace/b/package.details.json";
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [packageFileA, packageFileB],
                warnings: []
            }),
            loadText: jest.fn().mockImplementation(async (file: string) => {
                if (file === packageFileA) {
                    return {
                        value: JSON.stringify({
                            name: "pkg-a",
                            template: 123
                        }),
                        warnings: []
                    };
                }
                return {
                    value: JSON.stringify({
                        name: "",
                        template: 456
                    }),
                    warnings: []
                };
            })
        });

        const {result} = await loadWith(fileOps);

        expect(isErrors(result)).toBe(true);
        if (!isErrors(result)) throw new Error("Expected errors");

        const validationIssues = result.errors.filter(isValidationIssue);
        expect(validationIssues.length).toBeGreaterThanOrEqual(3);
        expect(validationIssues.some(issue => hasPackageFileContext(issue, packageFileA))).toBe(true);
        expect(validationIssues.some(issue => hasPackageFileContext(issue, packageFileB))).toBe(true);
    });
    it("returns duplicate package name issues", async () => {
        const packageFileA = "/workspace/a/package.details.json";
        const packageFileB = "/workspace/b/package.details.json";
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [packageFileB, packageFileA],
                warnings: []
            }),
            loadText: jest.fn().mockImplementation(async () => ({
                value: JSON.stringify({
                    name: "shared-name",
                    template: "template-a"
                }),
                warnings: []
            }))
        });

        const {result, recording} = await loadWith(fileOps);

        expect(isErrors(result)).toBe(true);
        if (!isErrors(result)) throw new Error("Expected errors");

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
            kind: "duplicatePackageName",
            context: {
                packageName: "shared-name",
                packageFiles: [packageFileA, packageFileB]
            }
        });

        expect(
            recording.debug.some(entry => entry.context === "loading.package.details")
        ).toBe(false);
    });
    it("returns success with no packages when no package details files are found", async () => {
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [],
                warnings: []
            })
        });

        const {result, recording} = await loadWith(fileOps);

        expect(isErrors(result)).toBe(false);
        if (isErrors(result)) throw new Error("Expected success");

        expect(result.value.loadedPackageDetails).toEqual({});
        expect(recording.debug).toContainEqual({
            context: "loading.package.details",
            level: "debug",
            msg: [{
                configDirectory: "/workspace",
                packageCount: 0,
                packageNames: []
            }]
        });
    });

    it("returns loaded package details keyed by package name in deterministic order", async () => {
        const packageFileA = "/workspace/z/package.details.json";
        const packageFileB = "/workspace/a/package.details.json";
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [packageFileA, packageFileB],
                warnings: []
            }),
            loadText: jest.fn().mockImplementation(async (file: string) => {
                if (file === packageFileA) {
                    return {
                        value: JSON.stringify({
                            name: "zebra",
                            template: "service"
                        }),
                        warnings: []
                    };
                }
                return {
                    value: JSON.stringify({
                        name: "alpha",
                        template: "library"
                    }),
                    warnings: []
                };
            })
        });

        const {result} = await loadWith(fileOps);

        expect(fileOps.findAllByNameUnder).toHaveBeenCalledWith(
            "/workspace",
            packageDetailsFileName
        );

        expect(isErrors(result)).toBe(false);
        if (isErrors(result)) throw new Error("Expected success");

        const loaded = result.value;

        expect(Object.keys(loaded.loadedPackageDetails)).toEqual(["alpha", "zebra"]);
        expect(loaded.loadedPackageDetails.alpha).toMatchObject({
            packageFile: packageFileB
        });
        expect(loaded.loadedPackageDetails.zebra).toMatchObject({
            packageFile: packageFileA
        });
    });

    it("records debug information on successful load", async () => {
        const packageFile = "/workspace/a/package.details.json";
        const fileOps = makeFileOps({
            findAllByNameUnder: jest.fn().mockResolvedValue({
                value: [packageFile],
                warnings: []
            }),
            loadText: jest.fn().mockResolvedValue({
                value: JSON.stringify({
                    name: "alpha",
                    template: "library"
                }),
                warnings: []
            })
        });

        const {result, recording} = await loadWith(fileOps);

        expect(isErrors(result)).toBe(false);
        if (isErrors(result)) throw new Error("Expected success");

        expect(recording.debug).toContainEqual({
            context: "loading.package.details",
            level: "debug",
            msg: [{
                configDirectory: "/workspace",
                packageCount: 1,
                packageNames: ["alpha"]
            }]
        });
    });
});