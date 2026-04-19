export function getLastSegment(path?: string | null): string {
    if (!path) return "";
    const segments = path.split("/").filter(Boolean);
    return segments.length ? segments[segments.length - 1] : "";
}