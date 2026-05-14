import { normalisePackageDetails, LoadedLaobanProject, LoadedPackageDetail } from "@laoban/package_details";
import { ScriptExecutionItem } from "@laoban/script_plan";
import { filterExecutionPlan, filter, removeEmpty, ScriptFilterValues } from "./filter.packages";

function pkg(name: string, dir: string): LoadedPackageDetail {
    return {
        packageFile: `${dir}/package.details.json`,
        dir,
        contents: normalisePackageDetails({
            template: "default",
            name
        })
    };
}

function loadedProject(...details: LoadedPackageDetail[]): LoadedLaobanProject {
    return {
        loadedLaobanConfig: {
            config: {
                throttle: 100,
                packageManager: "pnpm" as any,
                versionFile: "version.txt",
                parents: [],
                properties: {},
                templates: {},
                defaultEnv: {},
                scripts: {},
                skipDirectories: []
            },
            configFile: "/repo/laoban.json",
            configDirectory: "/repo",
            loadedFiles: ["/repo/laoban.json"]
        },
        loadedPackageDetails: Object.fromEntries(details.map(d => [d.contents.name, d]))
    };
}

function eachPackageItem(stepIndex: number, detail: LoadedPackageDetail, command: string): ScriptExecutionItem {
    return {
        kind: "eachPackage",
        stepIndex,
        pkg: detail,
        command: {
            command,
            status: true,
            executionScope: "eachPackage"
        }
    };
}

function workspaceItem(stepIndex: number, command: string): ScriptExecutionItem {
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

function context(cwd: string) {
    return {
        cwd,
        observability: {} as any,
        fileOps: {} as any,
        loadLaobanFileConfig: {} as any,
        loadConfigAndPackagesFn: async () => ({ value: {} } as any),
        handleLaobanScript: async () => ({ value: undefined } as any)
    } as any;
}

describe("removeEmpty", () => {
    it("removes empty inner arrays", () => {
        expect(removeEmpty([[1], [], [2, 3], []])).toEqual([[1], [2, 3]]);
    });
});

describe("filter", () => {
    it("filters items and removes empty generations", () => {
        expect(filter([[1, 2], [3], [4, 5]], n => n % 2 === 1)).toEqual([[1], [3], [5]]);
    });
});

describe("filterExecutionPlan", () => {
    const alpha = pkg("alpha", "/repo/packages/alpha");
    const beta = pkg("beta", "/repo/packages/beta");
    const scriptsCli = pkg("@laoban/scripts_cli", "/repo/packages/scripts_cli");
    const exampleCli = pkg("@laoban/examplecli", "/repo/packages/examplecli");

    const loaded = loadedProject(alpha, beta, scriptsCli, exampleCli);

    const plan: ScriptExecutionItem[][] = [
        [
            eachPackageItem(0, alpha, "build alpha"),
            eachPackageItem(0, beta, "build beta"),
            eachPackageItem(0, scriptsCli, "build scripts_cli"),
            eachPackageItem(0, exampleCli, "build examplecli")
        ],
        [
            workspaceItem(1, "publish everything")
        ]
    ];

    function options(overrides: Partial<ScriptFilterValues> = {}): ScriptFilterValues {
        return {
            one: false,
            all: false,
            packages: "",
            ...overrides
        };
    }

    it("returns the whole plan when all is true", () => {
        expect(
            filterExecutionPlan(
                loaded,
                plan,
                options({ all: true }),
                context("/repo/packages/alpha")
            )
        ).toEqual(plan);
    });

    it("filters by packages regex against dir and keeps workspace items", () => {
        expect(
            filterExecutionPlan(
                loaded,
                plan,
                options({ packages: "beta" }),
                context("/repo/elsewhere")
            )
        ).toEqual([
            [eachPackageItem(0, beta, "build beta")],
            [workspaceItem(1, "publish everything")]
        ]);
    });

    it("filters by packages regex using anchored match against dir", () => {
        expect(
            filterExecutionPlan(
                loaded,
                plan,
                options({ packages: "cli$" }),
                context("/repo/elsewhere")
            )
        ).toEqual([
            [eachPackageItem(0, scriptsCli, "build scripts_cli"), eachPackageItem(0, exampleCli, "build examplecli")],
            [workspaceItem(1, "publish everything")]
        ]);
    });

    it("filters to current directory when one is true", () => {
        expect(
            filterExecutionPlan(
                loaded,
                plan,
                options({ one: true }),
                context("/repo/packages/alpha")
            )
        ).toEqual([
            [eachPackageItem(0, alpha, "build alpha")],
            [workspaceItem(1, "publish everything")]
        ]);
    });

    it("filters to current directory when cwd is a package dir and one is false", () => {
        expect(
            filterExecutionPlan(
                loaded,
                plan,
                options(),
                context("/repo/packages/beta")
            )
        ).toEqual([
            [eachPackageItem(0, beta, "build beta")],
            [workspaceItem(1, "publish everything")]
        ]);
    });

    it("normalises windows cwd before comparing to dir", () => {
        expect(
            filterExecutionPlan(
                loaded,
                plan,
                options(),
                context("\\repo\\packages\\beta")
            )
        ).toEqual([
            [eachPackageItem(0, beta, "build beta")],
            [workspaceItem(1, "publish everything")]
        ]);
    });

    it("returns the plan unchanged when no filter applies", () => {
        expect(
            filterExecutionPlan(
                loaded,
                plan,
                options(),
                context("/repo/not-a-package")
            )
        ).toEqual(plan);
    });
});