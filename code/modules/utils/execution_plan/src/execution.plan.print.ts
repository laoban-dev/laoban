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
    const allItems = plan.flat();
    const maxNameWidth = allItems.length === 0
        ? 0
        : Math.max(...allItems.map(item => tc.name(item).length));

    const generationLabel = tc.generationLabel ?? (index => `Generation ${index}`);
    const lines: string[] = [];

    plan.forEach((generation, index) => {
        lines.push(`  ${generationLabel(index)}`);

        generation.forEach(item => {
            const prefix = tc.prefix(item);
            const name = tc.name(item).padEnd(maxNameWidth);
            const script = tc.script(item);
            lines.push(`    - ${prefix}${name} ${script}`);
        });

        lines.push("");
    });

    return lines.join("\n");
}