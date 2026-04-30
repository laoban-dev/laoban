import {errors, errorsOrThrow, value, valueOrThrow} from "@laoban/errors";
import {fixedTimeService, recordingObservability} from "@laoban/observability";
import {prettyRecordJson} from "@laoban/records";
import {
    laobanPackageCommands,
    loadConfigAndPackages,
    loadSortedLaobanProject,
    makeNameToNormalisedPackageDetails,
    type LaobanPackageCliContext,
    type LoadConfigFn,
    type LoadPackagesFn,
} from "./package.cli";
import type {
    LoadedLaobanProject,
    LoadedPackageDetail,
    NormalisedPackageDetails
} from "@laoban/package_details";
import {packageDetailsGraph} from "@laoban/package_details/src/package.details.sort";
import {prettyPrintGenerationsSwimlanes, prettyPrintGenerationsVertical} from "@laoban/topologicalsort";

function loadedPackageDetail(
    packageFile: string,
    contents: NormalisedPackageDetails
): LoadedPackageDetail {
    return {
        packageFile,
        dir: packageFile.replace(/\/package\.details\.json$/, ""),
        contents,
    } as LoadedPackageDetail;
}

function normalised(
    name: string,
    links: string[] = [],
    extra: Partial<NormalisedPackageDetails> = {}
): NormalisedPackageDetails {
    return {
        template: "default",
        name,
        description: undefined,
        links,
        devLinks: [],
        peerLinks: [],
        allLinks: links,
        guards: {},
        files: {},
        meta: {},
        ...extra
    };
}

function loadedProject(
    packages: Record<string, LoadedPackageDetail>,
    configDirectory: string = "/workspace"
): LoadedLaobanProject {
    return {
        loadedLaobanConfig: {
            config: {
                packageManager: "pnpm" as any,
                versionFile: "version.txt",
                parents: [],
                properties: {},
                templates: {},
                defaultEnv: {},
                scripts: {},
                skipDirectories: []
            },
            configFile: `${configDirectory}/laoban.json`,
            configDirectory,
            loadedFiles: [`${configDirectory}/laoban.json`]
        },
        loadedPackageDetails: packages
    };
}

type TestLaobanPackageCliContext = LaobanPackageCliContext & {
    recording: ReturnType<typeof recordingObservability>;
    loadConfigFn: jest.MockedFunction<LoadConfigFn>;
    loadPackagesFn: jest.MockedFunction<LoadPackagesFn>;
};

function makeContext(): TestLaobanPackageCliContext {
    const recording = recordingObservability(
        {},
        "test-correlation-id",
        fixedTimeService(0)
    );

    const loadConfigFn = jest.fn() as jest.MockedFunction<LoadConfigFn>;
    const loadPackagesFn = jest.fn() as jest.MockedFunction<LoadPackagesFn>;

    return {
        cwd: "/workspace",
        fileOps: {} as any,
        observability: recording.observability,
        loadLaobanConfig: jest.fn(),
        loadLaobanFileConfig: jest.fn(),
        loadConfigFn,
        loadPackagesFn,
        loadConfigAndPackagesFn: loadConfigAndPackages,
        recording
    } as unknown as TestLaobanPackageCliContext;
}

function command(name: "list" | "view" | "sort"): any {
    const group: any = laobanPackageCommands as any;
    return group.commands?.[name] ?? group.children?.[name] ?? group[name];
}

const expectedLog = (msg: string) => ({
    moduleScope: {
        module: undefined,
        directory: ".",
    },
    msg: `00:00:00 INFO ${msg}\n`
});

describe("package cli", () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe("makeNameToNormalisedPackageDetails", () => {
        it("maps loaded package details to contents", () => {
            const alpha = normalised("alpha");
            const beta = normalised("beta", ["alpha"]);

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
        it("loads config then packages", async () => {
            const context = makeContext();
            const loadedConfig = {
                configDirectory: "/workspace"
            } as any;
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"]))
            });

            context.loadConfigFn.mockResolvedValue(value(loadedConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            const result = await loadConfigAndPackages(context);

            expect(valueOrThrow(result)).toEqual(loaded);
            expect(context.loadConfigFn).toHaveBeenCalledWith(context);
            expect(context.loadPackagesFn).toHaveBeenCalledWith(loadedConfig, context);
        });

        it("returns config load errors", async () => {
            const context = makeContext();
            context.loadConfigFn.mockResolvedValue(errors({kind: "badConfig", message: "cannot load config"} as any));

            const result = await loadConfigAndPackages(context);

            expect(errorsOrThrow(result)).toEqual([
                {kind: "badConfig", message: "cannot load config"}
            ]);
            expect(context.loadPackagesFn).not.toHaveBeenCalled();
        });

        it("returns package load errors", async () => {
            const context = makeContext();
            const loadedConfig = {
                configDirectory: "/workspace"
            } as any;

            context.loadConfigFn.mockResolvedValue(value(loadedConfig));
            context.loadPackagesFn.mockResolvedValue(errors({kind: "badPackages", message: "cannot load packages"} as any));

            const result = await loadConfigAndPackages(context);

            expect(errorsOrThrow(result)).toEqual([
                {kind: "badPackages", message: "cannot load packages"}
            ]);
        });
    });

    describe("loadSortedLaobanProject", () => {
        it("returns topological generations", async () => {
            const context = makeContext();
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
                gamma: loadedPackageDetail("/workspace/gamma/package.details.json", normalised("gamma", ["alpha"]))
            });

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            const result = await loadSortedLaobanProject(context);
            const sorted = valueOrThrow(result);

            expect(sorted.loaded).toEqual(loaded);
            expect(sorted.generations.map(g => g.map(p => p.name))).toEqual([
                ["alpha"],
                ["beta", "gamma"]
            ]);
        });

        it("returns empty generations when there are no packages", async () => {
            const context = makeContext();
            const loaded = loadedProject({});

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            const result = await loadSortedLaobanProject(context);

            expect(valueOrThrow(result).generations).toEqual([]);
        });

        it("returns sorting issues", async () => {
            const context = makeContext();
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha", ["beta"])),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"]))
            });

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            const result = await loadSortedLaobanProject(context);

            expect(errorsOrThrow(result)).toEqual([
                {
                    context: {
                        cyclePath: [
                            "alpha",
                            "beta",
                            "alpha"
                        ],
                        purpose: "sortLaobanProject"
                    },
                    kind: "graphCycle",
                    message: "Cycle detected in sortLaobanProject: alpha -> beta -> alpha"
                }
            ]);
        });
    });

    describe("commands", () => {
        it("list logs package name to package file mapping", async () => {
            const context = makeContext();
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"]))
            });

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            await command("list").execute({}, context);

            expect(context.recording.logs).toEqual([
                expectedLog(prettyRecordJson({
                    alpha: "/workspace/alpha/package.details.json",
                    beta: "/workspace/beta/package.details.json"
                }))
            ]);
        });

        it("view logs the package name requested", async () => {
            const context = makeContext();

            const result = await command("view").execute({name: "alpha"}, context);

            expect(result).toEqual({});
            expect(context.recording.logs).toEqual([
                expectedLog("package view alpha")
            ]);
        });

        it("sort logs vertical output by default", async () => {
            const context = makeContext();
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
                gamma: loadedPackageDetail("/workspace/gamma/package.details.json", normalised("gamma", ["beta"]))
            });

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            const expectedGenerations = valueOrThrow(await loadSortedLaobanProject(context)).generations;
            const expectedOutput = "\n" + prettyPrintGenerationsVertical(expectedGenerations, packageDetailsGraph);

            context.recording.logs.length = 0;
            context.loadConfigFn.mockClear();
            context.loadPackagesFn.mockClear();
            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            await command("sort").execute({horizontal: false}, context);

            expect(context.recording.logs).toEqual([
                expectedLog(expectedOutput)
            ]);
        });

        it("sort logs swimlane output when requested", async () => {
            const context = makeContext();
            const loaded = loadedProject({
                alpha: loadedPackageDetail("/workspace/alpha/package.details.json", normalised("alpha")),
                beta: loadedPackageDetail("/workspace/beta/package.details.json", normalised("beta", ["alpha"])),
                gamma: loadedPackageDetail("/workspace/gamma/package.details.json", normalised("gamma", ["beta"]))
            });

            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            const expectedGenerations = valueOrThrow(await loadSortedLaobanProject(context)).generations;
            const expectedOutput = "\n" + prettyPrintGenerationsSwimlanes(expectedGenerations, packageDetailsGraph);

            context.recording.logs.length = 0;
            context.loadConfigFn.mockClear();
            context.loadPackagesFn.mockClear();
            context.loadConfigFn.mockResolvedValue(value(loaded.loadedLaobanConfig));
            context.loadPackagesFn.mockResolvedValue(value(loaded));

            await command("sort").execute({horizontal: true}, context);

            expect(context.recording.logs).toEqual([
                expectedLog(expectedOutput)
            ]);
        });
    });
});