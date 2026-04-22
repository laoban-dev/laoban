export interface ExecutionPlanPrettyPrintTypeClass<G> {
    prefix(g: G): string;
    name(g: G): string;
    script(g: G): string;
    generationLabel?(index: number): string;
}

export function prettyPrintExecutionPlan<G>(
    plan: G[][],
    tc: ExecutionPlanPrettyPrintTypeClass<G>
): string {
    const allItems: G[] = plan.reduce((acc, generation) => acc.concat(generation), [] as G[]);

    const maxNameWidth =
        allItems.length === 0
            ? 0
            : Math.max(...allItems.map((item: G) => tc.name(item).length));

    const generationLabel = tc.generationLabel ?? ((index: number) => `Generation ${index}`);
    const lines: string[] = [];

    plan.forEach((generation, index) => {
        lines.push(`  ${generationLabel(index)}`);

        generation.forEach((item: G) => {
            const prefix = tc.prefix(item);
            const name = tc.name(item).padEnd(maxNameWidth);
            const script = tc.script(item);
            lines.push(`    - ${prefix}${name} ${script}`);
        });

        lines.push("");
    });

    return lines.join("\n");
}