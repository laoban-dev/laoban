import type { ConfigPath, ConfigPathValue } from "./config.path";

function ensureObject(value: unknown, path: string[]): Record<string, unknown> {
    if (Array.isArray(value)) {
        throw new Error(
            `configPathSetValue: attempted to traverse into an array at "${path.join(
                "."
            )}". Arrays are leaf nodes.`
        );
    }

    if (value !== null && typeof value === "object") return value as Record<string, unknown>;
    return {};
}

function setAtPath(
    current: unknown,
    parts: string[],
    value: unknown,
    depth = 0
): unknown {
    const key = parts[depth];
    const here = ensureObject(current, parts.slice(0, depth));

    if (depth === parts.length - 1) {
        return { ...here, [key]: value };
    }

    const next = here[key];
    const updatedChild = setAtPath(next, parts, value, depth + 1);
    return { ...here, [key]: updatedChild };
}

export function configPathSetValue<T, P extends ConfigPath<T>>(
    obj: T,
    path: P,
    value: ConfigPathValue<T, P>
): T {
    const parts = (path as string).split(".");
    if (!parts.length) return obj;

    const root = ensureObject(obj, []);
    return setAtPath(root, parts, value) as T;
}
