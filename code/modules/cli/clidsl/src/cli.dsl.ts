import {Observability} from "@laoban/observability";
import {NameAnd} from "@laoban/records";

export type CliValue = string | number | boolean | string[];
export type CliPositionalValue = Exclude<CliValue, boolean>;

export interface BasicCliContext {
    observability: Observability;
}

export type CliValueTypeName<T> =
    T extends string ? "string" :
        T extends number ? "number" :
            T extends boolean ? "boolean" :
                T extends string[] ? "string[]" :
                    never;

/** Validates that every property in T is a legal CliValue without requiring an index signature */
export type CliShape<T extends object> = {
    [K in keyof T]: T[K] extends CliValue ? T[K] : never
};

export interface CliParameterBase {
    description: string;
    required?: boolean;
}

export type CliValueShape<T extends CliValue> = {
    type: CliValueTypeName<T>;
};

export type CliOptionRequirement<T extends CliValue> = {
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

export type CliPositionalKey<T extends object> = {
    [K in keyof T]: T[K] extends CliPositionalValue ? K : never
}[keyof T];

export type CliOptionKey<T extends object> = {
    [K in keyof T]: T[K] extends CliValue ? K : never
}[keyof T];

export type CliPositionalParameters<
    T extends object,
    K extends keyof T = never
> = {
    [P in K]: CliPositionalParameterDef<Extract<T[P], CliPositionalValue>>;
};

export type CliOptionParameters<
    T extends object,
    K extends keyof T = never
> = {
    [P in K]: CliOptionParameterDef<Extract<T[P], CliValue>>;
};

export type CliExecute<
    T extends object,
    C extends BasicCliContext = BasicCliContext
> = (values: T, context: C) => Promise<any>;

export interface CliCommand<
    T extends CliShape<T>,
    C extends BasicCliContext = BasicCliContext,
    TPositionalKeys extends CliPositionalKey<T> = never,
    TOptionKeys extends Exclude<CliOptionKey<T>, TPositionalKeys> = never,
> {
    nodeType: "command";
    description: string;
    positionals: CliPositionalParameters<T, TPositionalKeys>;
    options: CliOptionParameters<T, TOptionKeys>;
    execute: CliExecute<T, C>;
}

export type AnyCliPositionalParameterDef =
    | CliPositionalParameterDef<string>
    | CliPositionalParameterDef<string[]>
    | CliPositionalParameterDef<number>;

export type AnyCliOptionParameterDef =
    | CliOptionParameterDef<string>
    | CliOptionParameterDef<string[]>
    | CliOptionParameterDef<number>
    | CliOptionParameterDef<boolean>;

export interface AnyCliCommand<C extends BasicCliContext = BasicCliContext> {
    nodeType: "command";
    description: string;
    positionals: NameAnd<AnyCliPositionalParameterDef>;
    options: NameAnd<AnyCliOptionParameterDef>;
    execute: CliExecute<Record<string, CliValue>, C>;
}

export interface CliRoot<C extends BasicCliContext = BasicCliContext> {
    nodeType: "root";
    name: string;
    description: string;
    version?: string;
    children: Record<string, CliGroup<C> | AnyCliCommand<C>>;
}

export interface CliGroup<C extends BasicCliContext = BasicCliContext> {
    nodeType: "group";
    description: string;
    children: Record<string, CliGroup<C> | AnyCliCommand<C>>;
}

export type CliNode<C extends BasicCliContext = BasicCliContext> =
    | CliRoot<C>
    | CliGroup<C>
    | AnyCliCommand<C>;

export type CliModel<C extends BasicCliContext = BasicCliContext> = CliRoot<C>;

export function isCliRoot<C extends BasicCliContext = BasicCliContext>(
    node: CliNode<C>
): node is CliRoot<C> {
    return node.nodeType === "root";
}

export function isCliGroup<C extends BasicCliContext = BasicCliContext>(
    node: CliNode<C> | CliGroup<C> | AnyCliCommand<C>
): node is CliGroup<C> {
    return node.nodeType === "group";
}

export function isCliCommand<C extends BasicCliContext = BasicCliContext>(
    node: CliNode<C> | CliGroup<C> | AnyCliCommand<C>
): node is AnyCliCommand<C> {
    return node.nodeType === "command";
}

export function root<C extends BasicCliContext = BasicCliContext>(
    name: string,
    description: string,
    children: Record<string, CliGroup<C> | AnyCliCommand<C>>,
    version?: string
): CliRoot<C> {
    return {
        nodeType: "root",
        name,
        description,
        version,
        children
    };
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

export function command<
    T extends CliShape<T>,
    C extends BasicCliContext = BasicCliContext,
    TPositionalKeys extends CliPositionalKey<T> = never,
    TOptionKeys extends Exclude<CliOptionKey<T>, TPositionalKeys> = never,
>(
    description: string,
    positionals: CliPositionalParameters<T, TPositionalKeys>,
    options: CliOptionParameters<T, TOptionKeys>,
    execute: CliExecute<T, C>
): CliCommand<T, C, TPositionalKeys, TOptionKeys> {
    return {
        nodeType: "command",
        description,
        positionals,
        options,
        execute
    };
}

export interface CliCommandSpec<
    T extends CliShape<T>,
    C extends BasicCliContext ,
    P extends CliPositionalKey<T>,
    O extends Exclude<CliOptionKey<T>, P>,
> {
    description: string;
    positionals: CliPositionalParameters<T, P>;
    options: CliOptionParameters<T, O>;
    execute: CliExecute<T, C>;
}

export function defineCommand<
    T extends CliShape<T>,
    C extends BasicCliContext = BasicCliContext
>() {
    return function <
        P extends CliPositionalKey<T>,
        O extends Exclude<CliOptionKey<T>, P>
    >(spec: CliCommandSpec<T, C, P, O>): CliCommand<T, C, P, O> {
        return {
            nodeType: "command",
            description: spec.description,
            positionals: spec.positionals,
            options: spec.options,
            execute: spec.execute
        };
    };
}