import {frozenEmptyObject, mutableEmptyObject} from "@laoban/records";

const mutableEmptyArray: never[] = [];

const frozenEmptyArray = Object.freeze([] as never[]);

export function safeArray<T>(value: T | T[] | null | undefined): T[] {
    if (value == null) return mutableEmptyArray as T[];
    return Array.isArray(value) ? value : [value];
}

export function freezeArray<T>(value: T | readonly T[] | null | undefined): readonly T[] {
    if (value == null) return frozenEmptyArray;
    return Object.freeze(Array.isArray(value) ? [...value] : [value]);
}

export function safeObject<T>(value: Record<string, T> | null | undefined): Record<string, T> {
    if (value == null) return mutableEmptyObject as Record<string, T>;
    return value;
}

export function freezeObject<T>(value: Record<string, T> | null | undefined): Readonly<Record<string, T>> {
    if (value == null) return frozenEmptyObject as Readonly<Record<string, T>>;
    return Object.freeze({...value});
}

export function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return "<unstringifiable>";
    }
}

export function safePrettyJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return "<unstringifiable>";
    }
}