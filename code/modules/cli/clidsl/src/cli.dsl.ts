import { Observability } from "@laoban/observability";

export type CliValue = string | number | boolean | string[];
export type CliRecord = Record<string, CliValue>;
export type CliPositionalValue = Exclude<CliValue, boolean>;

export interface BasicCliContext<DebugContext extends string = string> {
    observability: Observability<DebugContext>;
}

export type CliValueTypeName<T> =
    T extends string ? "string" :
        T extends number ? "number" :
            T extends boolean ? "boolean" :
                T extends string[] ? "string[]" :
                    never;

export interface CliParameterBase {
    description: string;
    required?: boolean;
}

export type CliValueShape<T> = {
    type: CliValueTypeName<T>;
};
export type CliOptionRequirement<T> = {
    required?: boolean;
    defaultValue?: T;
};
export type CliPositionalParameterDef<T extends CliPositionalValue> =
    CliParameterBase & CliValueShape<T>;

export type CliOptionParameterDef<T extends CliValue> =
    {
        description: string;
        shortName?: string;
    }
    & CliValueShape<T>
    & CliOptionRequirement<T>;

export type CliPositionalKey<T extends CliRecord> = {
    [K in keyof T]: T[K] extends CliPositionalValue ? K : never
}[keyof T];

export type CliOptionKey<T extends CliRecord> = keyof T;

export type CliPositionalParameters<
    T extends CliRecord,
    K extends keyof T = never
> = {
    [P in K]: CliPositionalParameterDef<Extract<T[P], CliPositionalValue>>;
};

export type CliOptionParameters<
    T extends CliRecord,
    K extends keyof T = never
> = {
    [P in K]: CliOptionParameterDef<T[P]>;
};

export type CliExecute<
    T extends CliRecord,
    C extends BasicCliContext = BasicCliContext
> = (values: T, context: C) => Promise<any>;

export interface CliCommand<
    T extends CliRecord,
    TPositionalKeys extends CliPositionalKey<T> = never,
    TOptionKeys extends Exclude<CliOptionKey<T>, TPositionalKeys> = never,
    C extends BasicCliContext = BasicCliContext
> {
    nodeType: "command";
    description: string;
    positionals: CliPositionalParameters<T, TPositionalKeys>;
    options: CliOptionParameters<T, TOptionKeys>;
    execute: CliExecute<T, C>;
}

export type AnyCliCommand<C extends BasicCliContext = BasicCliContext> =
    CliCommand<CliRecord, never, never, C>;

export interface CliGroup<C extends BasicCliContext = BasicCliContext> {
    nodeType: "group";
    description: string;
    children: Record<string, CliGroup<C> | AnyCliCommand<C>>;
}

export type CliModel<C extends BasicCliContext = BasicCliContext> = CliGroup<C>;

export function isCliGroup<C extends BasicCliContext = BasicCliContext>(
    node: CliGroup<C> | AnyCliCommand<C>
): node is CliGroup<C> {
    return node.nodeType === "group";
}

export function isCliCommand<C extends BasicCliContext = BasicCliContext>(
    node: CliGroup<C> | AnyCliCommand<C>
): node is AnyCliCommand<C> {
    return node.nodeType === "command";
}

export function group<C extends BasicCliContext = BasicCliContext>(
    description: string,
    children: Record<string, CliGroup<C> | AnyCliCommand<C>>
): CliGroup<C> {
    return {
        nodeType: "group",
        description,
        children
    };
}

/**
 * Low-level constructor when you want to state the positional and option key
 * unions explicitly.
 */
export function command<
    T extends CliRecord,
    TPositionalKeys extends CliPositionalKey<T> = never,
    TOptionKeys extends Exclude<CliOptionKey<T>, TPositionalKeys> = never,
    C extends BasicCliContext = BasicCliContext
>(
    description: string,
    positionals: CliPositionalParameters<T, TPositionalKeys>,
    options: CliOptionParameters<T, TOptionKeys>,
    execute: CliExecute<T, C>
): CliCommand<T, TPositionalKeys, TOptionKeys, C> {
    return {
        nodeType: "command",
        description,
        positionals,
        options,
        execute
    };
}

export interface CliCommandSpec<
    T extends CliRecord,
    P extends CliPositionalKey<T>,
    O extends Exclude<CliOptionKey<T>, P>,
    C extends BasicCliContext = BasicCliContext
> {
    description: string;
    positionals: CliPositionalParameters<T, P>;
    options: CliOptionParameters<T, O>;
    execute: CliExecute<T, C>;
}

/**
 * Preferred constructor for authoring commands.
 *
 * Usage:
 *   const cmd = defineCommand<MyValues, MyContext>()({
 *     description: "...",
 *     positionals: { ... },
 *     options: { ... },
 *     execute: async (values, context) => { ... }
 *   });
 *
 * The full values type T is stated once. The positional and option key unions
 * are inferred from the keys present in the supplied objects.
 */
export function defineCommand<
    T extends CliRecord,
    C extends BasicCliContext = BasicCliContext
>() {
    return function <
        P extends CliPositionalKey<T>,
        O extends Exclude<CliOptionKey<T>, P>
    >(spec: CliCommandSpec<T, P, O, C>): CliCommand<T, P, O, C> {
        return {
            nodeType: "command",
            description: spec.description,
            positionals: spec.positionals,
            options: spec.options,
            execute: spec.execute
        };
    };
}