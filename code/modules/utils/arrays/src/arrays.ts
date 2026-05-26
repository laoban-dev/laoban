export function findMax<T>(
    values: T[],
    val: (value: T) => number,
): number {
    return values.reduce(
        (max, value) => Math.max(max, val(value)),
        0,
    )
}