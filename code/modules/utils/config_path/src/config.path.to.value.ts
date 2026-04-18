import type { ConfigPath, ConfigPathValue } from "./config.path";



export function configPathToValue<T , P extends ConfigPath<T>>(
    obj: T,
    path: P
): ConfigPathValue<T, P> | undefined {
    const parts = (path as string).split(".");
    let acc: unknown = obj;

    for (let i = 0; i < parts.length; i++) {
        const key = parts[i];

        if (acc === null || acc === undefined) return undefined;

        // If we are about to traverse *into* an array (i.e. not at the end), that's a config error.
        if (Array.isArray(acc)) {
            throw new Error(
                `configPathToValue: attempted to traverse into an array at "${parts.slice(0, i).join(".")}". ` +
                `Arrays are leaf nodes; path "${path}" is invalid.`
            );
        }

        if (typeof acc !== "object") return undefined;

        acc = (acc as Record<string, unknown>)[key];
    }

    return acc as ConfigPathValue<T, P> | undefined;
}
