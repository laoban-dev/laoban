// prefix.and.value.ts

export type Prefix = string
export type Value = string

export type PrefixAndValue = Readonly<{
    prefix: Prefix
    value: Value

    /**
     * True when the prefix was present in the original text.
     * False when defaultPrefix was used.
     */
    explicitPrefix: boolean
}>

export type PrefixAndValueOptions = Readonly<{
    /**
     * Used when the text does not contain a prefix separator.
     */
    defaultPrefix: Prefix

    /**
     * Defaults to ":".
     */
    separator?: string
}>

export const defaultPrefixAndValueOptions: PrefixAndValueOptions = {
    defaultPrefix: "script",
    separator: ":"
}

export function separatorFrom(
    options: PrefixAndValueOptions = defaultPrefixAndValueOptions
): string {
    return options.separator ?? defaultPrefixAndValueOptions.separator!
}

export function toPrefixAndValue(
    text: string,
    options: PrefixAndValueOptions = defaultPrefixAndValueOptions
): PrefixAndValue {
    const separator = separatorFrom(options)
    const index = text.indexOf(separator)

    if (index < 0) {
        return {
            prefix: options.defaultPrefix,
            value: text,
            explicitPrefix: false
        }
    }

    return {
        prefix: text.slice(0, index),
        value: text.slice(index + separator.length),
        explicitPrefix: true
    }
}

export function fromPrefixAndValue(
    prefixAndValue: PrefixAndValue,
    options: PrefixAndValueOptions = defaultPrefixAndValueOptions
): string {
    const separator = separatorFrom(options)

    return prefixAndValue.explicitPrefix
        ? `${prefixAndValue.prefix}${separator}${prefixAndValue.value}`
        : prefixAndValue.value
}

export function canonicalFromPrefixAndValue(
    prefixAndValue: PrefixAndValue,
    options: PrefixAndValueOptions = defaultPrefixAndValueOptions
): string {
    const separator = separatorFrom(options)
    return `${prefixAndValue.prefix}${separator}${prefixAndValue.value}`
}

export function hasPrefix(
    prefixAndValue: PrefixAndValue,
    prefix: Prefix
): boolean {
    return prefixAndValue.prefix === prefix
}