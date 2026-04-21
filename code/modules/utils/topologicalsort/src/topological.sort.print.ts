import {NameAndDependsOn} from "./topological.sort";

export function prettyPrintGenerationsLinear<G>(
    generations: G[][],
    typeclass: Pick<NameAndDependsOn<G>, "getName">
): string {
    return JSON.stringify(
        generations.map(generation => generation.map(typeclass.getName)),
        null,
        2
    );
}

export function prettyPrintGenerationsSwimlanes<G>(
    generations: G[][],
    typeclass: Pick<NameAndDependsOn<G>, "getName">
): string {
    if (generations.length === 0) return "";

    const names = generations.map(generation => generation.map(typeclass.getName));
    const columnWidths = names.map(generation =>
        generation.length === 0
            ? 0
            : Math.max(...generation.map(name => name.length))
    );

    const maxRows = Math.max(...names.map(generation => generation.length));

    const lines: string[] = [];

    for (let row = 0; row < maxRows; row++) {
        const cells = names.map((generation, col) => {
            const name = generation[row] ?? "";
            return name.padEnd(columnWidths[col], " ");
        });

        lines.push(cells.join("  ").replace(/\s+$/, ""));
    }

    return lines.join("\n");
}

export function prettyPrintGenerationsVertical<G>(
    generations: G[][],
    typeclass: Pick<NameAndDependsOn<G>, "getName">
): string {
    if (generations.length === 0) return "";

    const names = generations.map(generation => generation.map(typeclass.getName));

    const maxColumns = Math.max(...names.map(generation => generation.length));

    const columnWidths = Array.from({ length: maxColumns }, (_, index) =>
        Math.max(
            ...names.map(generation => (generation[index] ?? "").length)
        )
    );

    return names
        .map(generation =>
            generation
                .map((name, index) => name.padEnd(columnWidths[index], " "))
                .join("  ")
                .replace(/\s+$/, "")
        )
        .join("\n");
}