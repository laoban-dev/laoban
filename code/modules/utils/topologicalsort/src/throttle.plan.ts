export type ThrottlePlan<G> = G[][]

export function throttlePlan<G>(
    generations: G[][],
    throttle: number,
): ThrottlePlan<G> {
    if (!Number.isInteger(throttle) || throttle < 1) {
        throw new Error(`Throttle must be a positive integer. Received: ${throttle}`)
    }

    const result: G[][] = []

    for (const generation of generations) {
        result.push(...chunkGeneration(generation, throttle))
    }

    return result
}

function chunkGeneration<G>(generation: G[], throttle: number): G[][] {
    const result: G[][] = []

    for (let i = 0; i < generation.length; i += throttle) {
        result.push(generation.slice(i, i + throttle))
    }

    return result
}