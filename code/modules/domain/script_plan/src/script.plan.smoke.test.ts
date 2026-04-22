import { valueOrThrow } from "@laoban/errors";
import { executionItemGraphName } from "@laoban/execution_plan";
import {
    LoadedLaobanProject,
    LoadedPackageDetail,
    normalisePackageDetails
} from "@laoban/package_details";
import { recordingObservability } from "@laoban/observability";
import { LaobanScript } from "@laoban/scripts";
import { makeScriptExecutionPlan, ScriptExecutionItem } from "./script.plan";

function pkg(name: string, links: string[] = []): LoadedPackageDetail {
    return {
        packageFile: `/repo/${name}/package.details.json`,
        contents: normalisePackageDetails({
            template: "default",
            name,
            links
        })
    };
}

function project(...pkgs: LoadedPackageDetail[]): LoadedLaobanProject {
    return {
        loadedLaobanConfig: {
            config: {} as any,
            configFile: "/repo/laoban.json",
            configDirectory: "/repo",
            loadedFiles: ["/repo/laoban.json"]
        },
        loadedPackageDetails: Object.fromEntries(
            pkgs.map(pkg => [pkg.contents.name, pkg])
        )
    };
}

function script(commands: LaobanScript["commands"]): LaobanScript {
    return {
        description: "test script",
        commands,
        commandArgs: {}
    } as LaobanScript;
}

function planNames(plan: ScriptExecutionItem[][]): string[][] {
    return plan.map(generation =>
        generation.map(item =>
            item.kind === "oncePerWorkSpace"
                ? "workspace"
                : `${item.stepIndex}:${item.command.command}:${item.pkg!.contents.name}`
        )
    );
}

describe("makeScriptExecutionPlan", () => {
    it("builds an execution plan for all loaded packages using allLinks", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("alpha");
        const beta = pkg("beta", ["alpha"]);
        const loadedProject = project(alpha, beta);

        const buildScript = script([
            { command: "compile", status: true, executionScope: "eachPackage" },
            { command: "install", status: true, executionScope: "oncePerWorkSpace" },
            { command: "test", status: true, executionScope: "eachPackage" }
        ]);

        const actual = valueOrThrow(
            makeScriptExecutionPlan(
                loadedProject,
                "build" as any,
                buildScript,
                observability
            )
        );

        expect(planNames(actual.plan)).toEqual([
            ["0:compile:alpha"],
            ["0:compile:beta"],
            ["workspace"],
            ["2:test:alpha"],
            ["2:test:beta"]
        ]);
        expect(actual.stats).toEqual({
            commandCount: 3,
            distinctPackageDetails: [alpha, beta],
            executionItemCount: 5,
            packageExecutionItemCount: 4,
            barrierCount: 1,
            generationCount: 5,
            largestGenerationSize: 1
        });
    });

    it("uses allLinks, so devLinks and peerLinks also affect ordering after normalisation", () => {
        const { observability } = recordingObservability();
        const alpha: LoadedPackageDetail = {
            packageFile: "/repo/alpha/package.details.json",
            contents: normalisePackageDetails({
                template: "default",
                name: "alpha"
            })
        };
        const beta: LoadedPackageDetail = {
            packageFile: "/repo/beta/package.details.json",
            contents: normalisePackageDetails({
                template: "default",
                name: "beta",
                devLinks: ["alpha"]
            })
        };

        const loadedProject = project(alpha, beta);

        const buildScript = script([
            { command: "compile", status: true, executionScope: "eachPackage" }
        ]);

        const actual = valueOrThrow(
            makeScriptExecutionPlan(
                loadedProject,
                "build" as any,
                buildScript,
                observability
            )
        );

        expect(
            actual.plan.map(generation =>
                generation.map(item =>
                    item.kind === "oncePerWorkSpace"
                        ? "workspace"
                        : executionItemGraphName(item, {
                            makeEachPackage: () => {
                                throw new Error("not used in test");
                            },
                            makeOncePerWorkspace: () => {
                                throw new Error("not used in test");
                            },
                            kind: h => h.kind,
                            stepIndex: h => h.stepIndex,
                            command: h => h.command,
                            pkg: h => h.pkg,
                            display: h => h.kind === "oncePerWorkSpace"
                                ? `[${h.stepIndex}] workspace ${h.command.command}`
                                : `[${h.stepIndex}] ${h.pkg!.contents.name} ${h.command.command}`
                        }, {
                            getName: p => p.contents.name,
                            dependsOn: p => p.contents.allLinks
                        })
                )
            )
        ).toEqual([
            ["step:0:pkg:alpha"],
            ["step:0:pkg:beta"]
        ]);

        expect(beta.contents.allLinks).toEqual(["alpha"]);
    });
});