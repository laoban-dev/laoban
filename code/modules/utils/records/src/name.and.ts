export type NameAnd<T> = { [name: string]: T }
export type Env = NameAnd<string>
export const mutableEmptyObject: NameAnd<never> = {};
export const frozenEmptyObject = Object.freeze({} as NameAnd<never>);

export function invertObject(obj: NameAnd<string | string[]>): NameAnd<string> {
    const inverted: NameAnd<string> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            for (const item of value) inverted[item] = key;
        } else {
            inverted[value] = key;
        }
    }
    return inverted;
}

export function mapObject<T, R>(
    obj: NameAnd<T>,
    fn: (value: T, name: string, index: number) => R
): NameAnd<R> {
    const result: NameAnd<R> = {};
    let index = 0;
    for (const [name, value] of Object.entries(obj)) {
        result[name] = fn(value, name, index);
        index++;
    }
    return result;
}

export function mapEntries<T, R>(
    obj: Record<string, T>,
    fn: (value: T, name: string, index: number) => R
): R[] {
    const result: R[] = [];
    let index = 0;
    for (const [name, value] of Object.entries(obj)) {
        result.push(fn(value as T, name, index));
        index++;
    }
    return result;
}