import { ScriptExecutionItem } from "@laoban/script_plan";
import { LoadedLaobanProject } from "@laoban/package_details";
import { LaobanPackageCliContext } from "@laoban/package_cli";
import { normalisePath } from "@laoban/strings";

export interface ScriptFilterValues {
    one: boolean;
    all: boolean;
    packages: string;
}

export function removeEmpty<G>(plan: G[][]): G[][] {
    return plan.filter(g => g.length > 0);
}

export function filter<G>(items: G[][], keep: (g: G) => boolean): G[][] {
    return removeEmpty(items.map(g => g.filter(keep)));
}

export function filterExecutionPlan<C extends LaobanPackageCliContext>(
    loaded: LoadedLaobanProject,
    plan: ScriptExecutionItem[][],
    options: ScriptFilterValues,
    context: C
): ScriptExecutionItem[][] {
    if (options.all) return plan;

    const normalisedCwd = normalisePath(context.cwd) ?? "";

    if (options.packages) {
        const regex = new RegExp(options.packages);
        return filter(
            plan,
            g => g.kind === "oncePerWorkSpace" || regex.test(g.pkg?.dir ?? "")
        );
    }

    const one =
        options.one ||
        Object.values(loaded.loadedPackageDetails).some(detail => detail.dir === normalisedCwd);

    if (one) {
        return filter(
            plan,
            g => g.kind === "oncePerWorkSpace" || g.pkg?.dir === normalisedCwd
        );
    }

    return plan;
}