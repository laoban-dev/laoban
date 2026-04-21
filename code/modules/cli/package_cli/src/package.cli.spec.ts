import {errors, ErrorsOr, errorsOrThrow, value, valueOrThrow} from "@laoban/errors";
import type {FileOpIssue, FileOps} from "@laoban/files";
import {recordingObservability} from "@laoban/observability";
import {prettyRecordJson} from "@laoban/records";
import {
    laobanPackageCommands,
    loadConfigAndPackages,
    loadSortedLaobanProject,
    makeNameToNormalisedPackageDetails,
    type LaobanPackageCliContext,
} from "./package.cli";
import type {LoadedLaobanProject, LoadedPackageDetail, NormalisedPackageDetails} from "@laoban/package_details";
import {packageDetailsGraph} from "@laoban/package_details/src/package.details.sort";
import {prettyPrintGenerationsSwimlanes, prettyPrintGenerationsVertical} from "@laoban/topologicalsort";

function pkg(name: string, links: string[] = [], extra: Record<string, unknown> = {}) {
    return JSON.stringify({
        template: "default",
        name,
        links,
        ...extra,
    });
}

function fileIssue(message: string): FileOpIssue {
    return {
        kind: "unexpected",
        message,
        severity: "error",
        context: {operation: "test"}
    };
}


function makeFileOps(
    files: Record<string, string>,
    options: {
        findAllError?: FileOpIssue;
        loadTextErrors?: Record<string, FileOpIssue>;
    } = {}
): FileOps {
    return {
        findContainingDirectory: jest.fn(),

        findAllByNameUnder: jest.fn(
            async (_directory: string, targetFileName: string): Promise<ErrorsOr<string[], FileOpIssue>> => {
                if (options.findAllError) return errors<FileOpIssue>(options.findAllError);
                return value<string[], FileOpIssue>(
                    Object.keys(files)
                        .filter(filename => filename.endsWith(targetFileName))
                        .sort((a, b) => a.localeCompare(b))
                );
            }
        ),

        loadText: jest.fn(
            async (source: string): Promise<ErrorsOr<string, FileOpIssue>> => {
                const error = options.loadTextErrors?.[source];
                if (error) return errors<FileOpIssue>(error);

                const found = files[source];
                if (found === undefined) return errors<FileOpIssue>(fileIssue(`Missing test file ${source}`));

                return value<string, FileOpIssue>(found);
            }
        )
    };
}


function makeContext(
    files: Record<string, string>,
    options: {
        findAllError?: FileOpIssue;
        loadTextErrors?: Record<string, FileOpIssue>;
    } = {}
): LaobanPackageCliContext & {
    recording: ReturnType<typeof recordingObservability>;
    loadLaobanConfig: jest.Mock;
} {
    const recording = recordingObservability();
    const fileOps = makeFileOps(files, options);

    const loadLaobanConfig = jest.fn(async () =>
        value({
            configDirectory: "/workspace"
        } as any)
    );

    return {
        cwd: "/workspace",
        fileOps,
        observability: recording.observability,
        loadLaobanFileConfig: jest.fn(),
        loadLaobanConfig,
        loadConfigAndPackagesFn: loadConfigAndPackages,
        recording
    } as any;
}

function command(name: "list" | "view" | "sort"): any {
    const group: any = laobanPackageCommands as any;
    return group.commands?.[name] ?? group.children?.[name] ?? group[name];
}

function loadedPackageDetail(
    packageFile: string,
    contents: NormalisedPackageDetails
): LoadedPackageDetail {
    return {packageFile, contents};
}

describe("package cli", () => {
    describe("makeNameToNormalisedPackageDetails", () => {
        it("maps loaded package details to contents", () => {
            const alpha: NormalisedPackageDetails = {
                template: "default",
                name: "alpha",
                description: "Alpha",
                links: [],
                devLinks: [],
                peerLinks: [],
                allLinks: [],
                guards: {},
                files: {},
                meta: {}
            };
            const beta: NormalisedPackageDetails = {
                template: "default",
                name: "beta",
                description: undefined,
                links: ["alpha"],
                devLinks: [],
                peerLinks: [],
                allLinks: ["alpha"],
                guards: {},
                files: {},
                meta: {}
            };

            expect(
                makeNameToNormalisedPackageDetails({
                    alpha: loadedPackageDetail("/workspace/alpha/package.details.json", alpha),
                    beta: loadedPackageDetail("/workspace/beta/package.details.json", beta)
                })
            ).toEqual({
                alpha,
                beta
            });
        });

        it("returns empty object for empty input", () => {
            expect(makeNameToNormalisedPackageDetails({})).toEqual({});
        });
    });

    describe("loadConfigAndPackages", () => {
        it("loads packages from discovered package.details.json files", async () => {
            const context = makeContext({
                "/workspace/alpha/package.details.json": pkg("alpha"),
                "/workspace/beta/package.details.json": pkg("beta", ["alpha"])
            });

            const result = await loadConfigAndPackages(context);
            const loaded = valueOrThrow(result);

            expect(loaded).toEqual({
                loadedLaobanConfig: {
                    configDirectory: "/workspace"
                },
                loadedPackageDetails: {
                    alpha: {
                        packageFile: "/workspace/alpha/package.details.json",
                        contents: {
                            template: "default",
                            name: "alpha",
                            description: undefined,
                            links: [],
                            devLinks: [],
                            peerLinks: [],
                            allLinks: [],
                            guards: {},
                            files: {},
                            meta: {}
                        }
                    },
                    beta: {
                        packageFile: "/workspace/beta/package.details.json",
                        contents: {
                            template: "default",
                            name: "beta",
                            description: undefined,
                            links: ["alpha"],
                            devLinks: [],
                            peerLinks: [],
                            allLinks: ["alpha"],
                            guards: {},
                            files: {},
                            meta: {}
                        }
                    }
                }
            });

            expect(context.recording.debug).toContainEqual({
                context: "loading.package.details",
                level: "debug",
                msg: [
                    {
                        configDirectory: "/workspace",
                        packageCount: 2,
                        packageNames: ["alpha", "beta"]
                    }
                ]
            });
        });

        it("returns duplicate package name issues", async () => {
            const context = makeContext({
                "/workspace/a/package.details.json": pkg("dup"),
                "/workspace/b/package.details.json": pkg("dup")
            });

            const result = await loadConfigAndPackages(context);

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "duplicatePackageName",
                    message: "Duplicate package name 'dup' found in multiple package details files",
                    context: {
                        packageName: "dup",
                        packageFiles: [
                            "/workspace/a/package.details.json",
                            "/workspace/b/package.details.json"
                        ]
                    }
                }
            ]);
        });

        it("returns parse error when package details json is invalid", async () => {
            const context = makeContext({
                "/workspace/a/package.details.json": "{ broken json"
            });

            const result = await loadConfigAndPackages(context);

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "parsePackageDetailsFailed",
                    message: "Could not parse package details JSON in /workspace/a/package.details.json",
                    context: {
                        packageFile: "/workspace/a/package.details.json",
                        error: expect.any(String)
                    }
                }
            ]);
        });

        it("returns findPackageDetailsFailed when discovery fails", async () => {
            const context = makeContext(
                {},
                {findAllError: fileIssue("cannot scan workspace")}
            );

            const result = await loadConfigAndPackages(context);

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "findPackageDetailsFailed",
                    message: "Could not search for package.details.json files under /workspace",
                    context: {
                        configDirectory: "/workspace",
                        markerFileName: "package.details.json",
                        issues: [
                            {
                                kind: "unexpected",
                                message: "cannot scan workspace",
                                severity: "error",
                                context: {operation: "test"}
                            }
                        ]
                    }
                }
            ]);
        });

        it("returns loadPackageDetailsFailed when a package file cannot be loaded", async () => {
            const context = makeContext(
                {
                    "/workspace/a/package.details.json": pkg("alpha")
                },
                {
                    loadTextErrors: {
                        "/workspace/a/package.details.json": fileIssue("cannot read package file")
                    }
                }
            );

            const result = await loadConfigAndPackages(context);

            expect(errorsOrThrow(result)).toEqual([
                {
                    kind: "loadPackageDetailsFailed",
                    message: "Could not load package details file /workspace/a/package.details.json",
                    context: {
                        packageFile: "/workspace/a/package.details.json",
                        issues: [
                            {
                                kind: "unexpected",
                                message: "cannot read package file",
                                severity: "error",
                                context: {operation: "test"}
                            }
                        ]
                    }
                }
            ]);
        });
    });

    describe("loadSortedLaobanProject", () => {
        it("returns topological generations", async () => {
            const context = makeContext({
                "/workspace/alpha/package.details.json": pkg("alpha"),
                "/workspace/beta/package.details.json": pkg("beta", ["alpha"]),
                "/workspace/gamma/package.details.json": pkg("gamma", ["alpha"])
            });

            const result = await loadSortedLaobanProject(context);
            const sorted = valueOrThrow(result);

            expect(sorted.loaded.loadedPackageDetails).toEqual({
                alpha: {
                    packageFile: "/workspace/alpha/package.details.json",
                    contents: {
                        template: "default",
                        name: "alpha",
                        description: undefined,
                        links: [],
                        devLinks: [],
                        peerLinks: [],
                        allLinks: [],
                        guards: {},
                        files: {},
                        meta: {}
                    }
                },
                beta: {
                    packageFile: "/workspace/beta/package.details.json",
                    contents: {
                        template: "default",
                        name: "beta",
                        description: undefined,
                        links: ["alpha"],
                        devLinks: [],
                        peerLinks: [],
                        allLinks: ["alpha"],
                        guards: {},
                        files: {},
                        meta: {}
                    }
                },
                gamma: {
                    packageFile: "/workspace/gamma/package.details.json",
                    contents: {
                        template: "default",
                        name: "gamma",
                        description: undefined,
                        links: ["alpha"],
                        devLinks: [],
                        peerLinks: [],
                        allLinks: ["alpha"],
                        guards: {},
                        files: {},
                        meta: {}
                    }
                }
            });

            expect(sorted.generations.map(g => g.map(p => p.name))).toEqual([
                ["alpha"],
                ["beta", "gamma"]
            ]);
        });

        it("returns empty generations when there are no packages", async () => {
            const context = makeContext({});

            const result = await loadSortedLaobanProject(context);

            expect(valueOrThrow(result).generations).toEqual([]);
        });
    });

    describe("commands", () => {
        it("list logs package name to package file mapping", async () => {
            const context = makeContext({
                "/workspace/alpha/package.details.json": pkg("alpha"),
                "/workspace/beta/package.details.json": pkg("beta", ["alpha"])
            });

            await command("list").execute({}, context);

            expect(context.recording.logs).toEqual([
                {
                    level: "info",
                    msg: [
                        prettyRecordJson({
                            alpha: "/workspace/alpha/package.details.json",
                            beta: "/workspace/beta/package.details.json"
                        })
                    ]
                }
            ]);
        });

        it("view logs the package name requested", async () => {
            const context = makeContext({});

            const result = await command("view").execute({name: "alpha"}, context);

            expect(result).toEqual({});
            expect(context.recording.logs).toEqual([
                {
                    level: "info",
                    msg: ["package view", "alpha"]
                }
            ]);
        });

        it("sort logs vertical output by default", async () => {
            const context = makeContext({
                "/workspace/alpha/package.details.json": pkg("alpha"),
                "/workspace/beta/package.details.json": pkg("beta", ["alpha"]),
                "/workspace/gamma/package.details.json": pkg("gamma", ["beta"])
            });

            const expectedGenerations = valueOrThrow(await loadSortedLaobanProject(context)).generations;
            const expectedOutput = "\n" + prettyPrintGenerationsVertical(expectedGenerations, packageDetailsGraph);

            context.recording.logs.length = 0;

            await command("sort").execute({horizontal: false}, context);

            expect(context.recording.logs).toEqual([
                {
                    level: "info",
                    msg: [expectedOutput]
                }
            ]);
        });

        it("sort logs swimlane output when requested", async () => {
            const context = makeContext({
                "/workspace/alpha/package.details.json": pkg("alpha"),
                "/workspace/beta/package.details.json": pkg("beta", ["alpha"]),
                "/workspace/gamma/package.details.json": pkg("gamma", ["beta"])
            });

            const expectedGenerations = valueOrThrow(await loadSortedLaobanProject(context)).generations;
            const expectedOutput = "\n" + prettyPrintGenerationsSwimlanes(expectedGenerations, packageDetailsGraph);

            context.recording.logs.length = 0;

            await command("sort").execute({horizontal: true}, context);

            expect(context.recording.logs).toEqual([
                {
                    level: "info",
                    msg: [expectedOutput]
                }
            ]);
        });
    });
});