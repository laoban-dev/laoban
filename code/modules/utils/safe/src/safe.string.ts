import {safeJson} from "./safe";

export const safeString = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
    if (value instanceof Error) return value.stack ?? value.message;
    return safeJson(value);
};