export type CliValue = string | string[] | boolean | number;
export type CliRecord = Record<string, CliValue>;

export type CliTypeName = 'string' | 'strings' | 'boolean' | 'number';

export type CliTypeFor<T> =
    T extends string ? 'string' :
        T extends string[] ? 'strings' :
            T extends boolean ? 'boolean' :
                T extends number ? 'number' :
                    never;

export interface CliFieldBase {
    description: string;
    required?: boolean;
}

export interface CliPositionalStringFieldDef extends CliFieldBase {
    kind: 'positionalString';
}

export interface CliPositionalStringsFieldDef extends CliFieldBase {
    kind: 'positionalStrings';
    variadic?: boolean;
}

export interface CliPositionalNumberFieldDef extends CliFieldBase {
    kind: 'positionalNumber';
}

export interface CliOptionStringFieldDef extends CliFieldBase {
    kind: 'optionString';
    shortName?: string;
}

export interface CliOptionStringsFieldDef extends CliFieldBase {
    kind: 'optionStrings';
    shortName?: string;
}

export interface CliOptionBooleanFieldDef extends CliFieldBase {
    kind: 'optionBoolean';
    shortName?: string;
}

export interface CliOptionNumberFieldDef extends CliFieldBase {
    kind: 'optionNumber';
    shortName?: string;
}

export type CliPositionalFieldDef =
    | CliPositionalStringFieldDef
    | CliPositionalStringsFieldDef
    | CliPositionalNumberFieldDef;

export type CliOptionFieldDef =
    | CliOptionStringFieldDef
    | CliOptionStringsFieldDef
    | CliOptionBooleanFieldDef
    | CliOptionNumberFieldDef;

export type CliFieldDef =
    | CliPositionalFieldDef
    | CliOptionFieldDef;

export type CliFieldDefFor<T extends CliValue> =
    T extends string ? CliPositionalStringFieldDef | CliOptionStringFieldDef :
        T extends string[] ? CliPositionalStringsFieldDef | CliOptionStringsFieldDef :
            T extends boolean ? CliOptionBooleanFieldDef :
                T extends number ? CliPositionalNumberFieldDef | CliOptionNumberFieldDef :
                    never;

export type CliFields<T extends CliRecord> = {
    [K in keyof T]: CliFieldDefFor<T[K]>;
};

export type CliExecute<T extends CliRecord, Ctx = void> = (values: T, context: Ctx) => Promise<void>;

export interface CliCommand<T extends CliRecord, Ctx = void> {
    description: string;
    fields: CliFields<T>;
    execute: CliExecute<T, Ctx>;
}

export type SomeCliCommand<Ctx = void> = CliCommand<CliRecord, Ctx>;
export type CliCommandMap<Ctx = void> = Record<string, SomeCliCommand<Ctx>>;
export type CliGroupMap<Ctx = void> = Record<string, CliGroup<Ctx>>;

export interface CliGroup<Ctx = void> {
    description: string;
    commands?: CliCommandMap<Ctx>;
    groups?: CliGroupMap<Ctx>;
}

export type CliModel<Ctx = void> = CliGroup<Ctx>;

export function isCliPositionalStringFieldDef(field: CliFieldDef): field is CliPositionalStringFieldDef {
    return field.kind === 'positionalString';
}

export function isCliPositionalStringsFieldDef(field: CliFieldDef): field is CliPositionalStringsFieldDef {
    return field.kind === 'positionalStrings';
}

export function isCliPositionalNumberFieldDef(field: CliFieldDef): field is CliPositionalNumberFieldDef {
    return field.kind === 'positionalNumber';
}

export function isCliPositionalFieldDef(field: CliFieldDef): field is CliPositionalFieldDef {
    return isCliPositionalStringFieldDef(field)
        || isCliPositionalStringsFieldDef(field)
        || isCliPositionalNumberFieldDef(field);
}

export function isCliOptionStringFieldDef(field: CliFieldDef): field is CliOptionStringFieldDef {
    return field.kind === 'optionString';
}

export function isCliOptionStringsFieldDef(field: CliFieldDef): field is CliOptionStringsFieldDef {
    return field.kind === 'optionStrings';
}

export function isCliOptionBooleanFieldDef(field: CliFieldDef): field is CliOptionBooleanFieldDef {
    return field.kind === 'optionBoolean';
}

export function isCliOptionNumberFieldDef(field: CliFieldDef): field is CliOptionNumberFieldDef {
    return field.kind === 'optionNumber';
}

export function isCliOptionFieldDef(field: CliFieldDef): field is CliOptionFieldDef {
    return isCliOptionStringFieldDef(field)
        || isCliOptionStringsFieldDef(field)
        || isCliOptionBooleanFieldDef(field)
        || isCliOptionNumberFieldDef(field);
}