export function getLastSegment(path?: string | null): string {
    if (!path) return "";
    const segments = path.split("/").filter(Boolean);
    return segments.length ? segments[segments.length - 1] : "";
}

export function noExtension(path?: string): string {
    if (!path) return "";
    const dot = path.lastIndexOf(".");
    return dot < 0 ? path : path.slice(0, dot);
}

export function toKebabCase(name: string | null | undefined): string | null | undefined {
    if (name === null || name === undefined) return name;
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/_/g, '-')
        .toLowerCase();
}

export function normalisePath(name: string | null | undefined): string | null | undefined {
    if (!name) return name
    return name.replace(/\\/g, "/");
}