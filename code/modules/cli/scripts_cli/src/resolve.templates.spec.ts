import { errors, value, valueOrThrow } from "@laoban/errors";
import { recordingObservability } from "@laoban/observability";
import {
    LoadedLaobanProject,
    LoadedPackageDetail,
    normalisePackageDetails
} from "@laoban/package_details";
import { ScriptExecutionItem } from "@laoban/script_plan";
import {
    detemplateOneScriptExecutionItem,
    detemplateScriptExecutionPlan,
    makeScriptExecutionItemTemplateDictionary
} from "./resolve.templates";

function pkg(name: string): LoadedPackageDetail {
    return {
        packageFile: `/repo/${name}/package.details.json`,
        dir: `/repo/${name}`,
        contents: normalisePackageDetails({
            template: "default",
            name
        })
    };
}

function loadedProject(...packages: LoadedPackageDetail[]): LoadedLaobanProject {
    return {
        loadedLaobanConfig: {
            config: {
                packageManager: "pnpm" as any,
                versionFile: "version.txt",
                parents: [],
                properties: { scope: "@laoban" },
                templates: {},
                defaultEnv: { NODE_ENV: "test" },
                scripts: {},
                skipDirectories: []
            },
            configFile: "/repo/laoban.json",
            configDirectory: "/repo",
            loadedFiles: ["/repo/laoban.json"]
        },
        loadedPackageDetails: Object.fromEntries(
            packages.map(p => [p.contents.name, p])
        )
    };
}

function eachPackageItem(
    stepIndex: number,
    packageDetail: LoadedPackageDetail,
    command: string
): ScriptExecutionItem {
    return {
        kind: "eachPackage",
        stepIndex,
        pkg: packageDetail,
        command: {
            command,
            status: true,
            executionScope: "eachPackage"
        }
    };
}

function workspaceItem(
    stepIndex: number,
    command: string
): ScriptExecutionItem {
    return {
        kind: "oncePerWorkSpace",
        stepIndex,
        command: {
            command,
            status: true,
            executionScope: "oncePerWorkSpace"
        }
    };
}

describe("makeScriptExecutionItemTemplateDictionary", () => {
    it("contains config values and packageDetails", () => {
        const alpha = pkg("@laoban/alpha");
        const project = loadedProject(alpha);
        const item = eachPackageItem(1, alpha, "${packageManager} publish ${packageDetails.name}");

        const expected = {
            ...project.loadedLaobanConfig.config,
            packageDetails: alpha.contents
        };
        delete expected.defaultEnv
        delete expected.parents
        delete expected.scripts
        delete expected.templates
        expect(makeScriptExecutionItemTemplateDictionary(item, project)).toEqual(expected);
    });

    it("uses undefined packageDetails for workspace items", () => {
        const project = loadedProject();
        const item = workspaceItem(1, "${packageManager} publish");

        const expected = {
            ...project.loadedLaobanConfig.config,
            packageDetails: undefined
        };
        delete expected.defaultEnv
        delete expected.parents
        delete expected.scripts
        delete expected.templates
        expect(makeScriptExecutionItemTemplateDictionary(item, project)).toEqual(expected);
    });
});

describe("detemplateOneScriptExecutionItem", () => {
    it("detemplates one eachPackage item using the default dictionary", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("@laoban/alpha");
        const project = loadedProject(alpha);
        const item = eachPackageItem(
            1,
            alpha,
            "${packageManager} publish ${packageDetails.name}"
        );

        const actual = valueOrThrow(
            detemplateOneScriptExecutionItem(item, project)
        );

        expect(actual).toEqual({
            ...item,
            command: {
                ...item.command,
                command: "pnpm publish @laoban/alpha"
            }
        });
    });

    it("uses a custom dictionary function when supplied", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("@laoban/alpha");
        const project = loadedProject(alpha);
        const item = eachPackageItem(0, alpha, "${x}-${y}");

        const actual = valueOrThrow(
            detemplateOneScriptExecutionItem(item, project, () => ({x: "hello", y: "world"}))
        );

        expect(actual.command.command).toEqual("hello-world");
    });

    it("returns template issues when variables are missing", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("@laoban/alpha");
        const project = loadedProject(alpha);
        const item = eachPackageItem(0, alpha, "${doesNotExist}");

        const actual = detemplateOneScriptExecutionItem(item, project);

        expect("errors" in actual).toBe(true);
    });
});

describe("detemplateScriptExecutionPlan", () => {
    it("detemplates the whole plan preserving generations", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("@laoban/alpha");
        const beta = pkg("@laoban/beta");
        const project = loadedProject(alpha, beta);

        const plan: ScriptExecutionItem[][] = [
            [
                eachPackageItem(0, alpha, "build ${packageDetails.name}"),
                eachPackageItem(0, beta, "build ${packageDetails.name}")
            ],
            [
                workspaceItem(1, "${packageManager} publish-all")
            ]
        ];

        const actual = valueOrThrow(
            detemplateScriptExecutionPlan(plan, project, observability)
        );

        expect(actual).toEqual([
            [
                {
                    ...plan[0][0],
                    command: {
                        ...plan[0][0].command,
                        command: "build @laoban/alpha"
                    }
                },
                {
                    ...plan[0][1],
                    command: {
                        ...plan[0][1].command,
                        command: "build @laoban/beta"
                    }
                }
            ],
            [
                {
                    ...plan[1][0],
                    command: {
                        ...plan[1][0].command,
                        command: "pnpm publish-all"
                    }
                }
            ]
        ]);
    });

    it("uses a custom dictionary function for the whole plan", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("@laoban/alpha");
        const project = loadedProject(alpha);

        const plan: ScriptExecutionItem[][] = [
            [eachPackageItem(0, alpha, "${value}")]
        ];

        const actual = valueOrThrow(
            detemplateScriptExecutionPlan(
                plan,
                project,
                observability,
                item => ({ value: `step-${item.stepIndex}` })
            )
        );

        expect(actual).toEqual([
            [
                {
                    ...plan[0][0],
                    command: {
                        ...plan[0][0].command,
                        command: "step-0"
                    }
                }
            ]
        ]);
    });

    it("returns errors when any item fails to detemplate", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("@laoban/alpha");
        const project = loadedProject(alpha);

        const plan: ScriptExecutionItem[][] = [
            [
                eachPackageItem(0, alpha, "ok ${packageManager}"),
                eachPackageItem(0, alpha, "bad ${missing}")
            ]
        ];

        const actual = detemplateScriptExecutionPlan(plan, project, observability);

        expect("errors" in actual).toBe(true);
    });

    it("preserves empty generations", () => {
        const { observability } = recordingObservability();
        const alpha = pkg("@laoban/alpha");
        const project = loadedProject(alpha);

        const plan: ScriptExecutionItem[][] = [
            [],
            [eachPackageItem(0, alpha, "build ${packageDetails.name}")],
            []
        ];

        const actual = valueOrThrow(
            detemplateScriptExecutionPlan(plan, project, observability)
        );

        expect(actual).toEqual([
            [],
            [
                {
                    ...plan[1][0],
                    command: {
                        ...plan[1][0].command,
                        command: "build @laoban/alpha"
                    }
                }
            ],
            []
        ]);
    });
});