import {ScriptExecutionItem} from "@laoban/script_plan"
import {LoadedLaobanProject} from "@laoban/package_details"
import {LaobanPackageCliContext} from "@laoban/package_cli"
import {normalisePath} from "@laoban/strings"

export interface ScriptFilterValues {
    one: boolean
    all: boolean
    packages: string
}

export function removeEmpty<G>(plan: G[][]): G[][] {
    return plan.filter(generation => generation.length > 0)
}

export function filter<G>(items: G[][], keep: (g: G) => boolean): G[][] {
    return removeEmpty(items.map(generation => generation.filter(keep)))
}

export function filterExecutionPlan<
    ReadChannel,
    WriteChannel,
    Ref,
>(
    loaded: LoadedLaobanProject,
    plan: ScriptExecutionItem[][],
    options: ScriptFilterValues,
    context: LaobanPackageCliContext<ReadChannel, WriteChannel, Ref>,
): ScriptExecutionItem[][] {
    if (options.all) return plan

    const normalisedCwd = normalisePath(context.cwd) ?? ""

    if (options.packages) {
        const regex = new RegExp(options.packages)

        return filter(
            plan,
            item =>
                item.kind === "oncePerWorkSpace" ||
                regex.test(item.pkg?.dir ?? ""),
        )
    }

    const one =
        options.one ||
        Object.values(loaded.loadedPackageDetails)
            .some(detail => detail.dir === normalisedCwd)

    if (one) {
        return filter(
            plan,
            item =>
                item.kind === "oncePerWorkSpace" ||
                item.pkg?.dir === normalisedCwd,
        )
    }

    return plan
}