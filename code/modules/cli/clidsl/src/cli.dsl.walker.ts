import type { Observability } from "@laoban/observability";
import { safeJson } from "@laoban/safe";
import {
    type AnyCliCommand,
    type BasicCliContext,
    type CliGroup,
    isCliCommand,
    isCliGroup
} from "./cli.dsl";


export interface CliWalkerConfig<Acc, C extends BasicCliContext = BasicCliContext> {
    observability: Observability;
    addGroup: (
        parent: Acc,
        name: string,
        group: CliGroup<C>
    ) => Acc;
    addLeafCommand: (
        parent: Acc,
        name: string,
        command: AnyCliCommand<C>
    ) => void | Acc;
}

export function walkCliModel<Acc, C extends BasicCliContext = BasicCliContext>(
    acc: Acc,
    model: CliGroup<C>,
    config: CliWalkerConfig<Acc, C>
): Acc {
    config.observability.debug("cli:adapter", "debug", "Walking CLI model");
    return walkCliGroupChildren(acc, model, config);
}

export function walkCliGroupChildren<Acc, C extends BasicCliContext = BasicCliContext>(
    acc: Acc,
    group: CliGroup<C>,
    config: CliWalkerConfig<Acc, C>
): Acc {
    for (const [name, node] of Object.entries(group.children))
        walkCliNode(acc, name, node, config);

    return acc;
}

export function walkCliNode<Acc, C extends BasicCliContext = BasicCliContext>(
    acc: Acc,
    name: string,
    node: CliGroup<C> | AnyCliCommand<C>,
    config: CliWalkerConfig<Acc, C>
): Acc {
    if (isCliGroup(node)) {
        config.observability.debug("cli:adapter", "debug", `Walking CLI group ${name}`);
        const childAcc = config.addGroup(acc, name, node);
        walkCliGroupChildren(childAcc, node, config);
        return acc;
    }
    if (isCliCommand(node)) {
        config.observability.debug("cli:adapter", "debug", `Walking CLI command ${name}`);
        config.addLeafCommand(acc, name, node);
        return acc;
    }
    throw new Error(`walkCliNode reached an unreachable branch for node '${name}': ${safeJson(node)}`);
}