// config.path.typespec.ts
// Compile-time only: no runtime code in this file.

type Leaf =
    | string
    | number
    | boolean
    | bigint
    | symbol
    | null
    | undefined
    | Date
    | RegExp
    | Function

type Join<K extends string, P extends string> = `${K}.${P}`

// Depth limiter to avoid "type instantiation is too deep"
type Prev = [never, 0, 1, 2, 3, 4, 5, 6]

// Structural semantics: optional props don't block paths
type Defined<T> = Exclude<T, undefined | null>

// ----- permissive (ANY union branch) semantics -----

type PathOneAny<T, D extends number> =
    [D] extends [never] ? never :
        T extends Leaf ? never :
            T extends readonly any[] ? never :
                {
                    [K in keyof T & string]:
                    Defined<T[K]> extends Leaf
                        ? K
                        : Defined<T[K]> extends readonly any[]
                            ? K
                            : K | Join<K, ConfigPath<Defined<T[K]>, Prev[D]>>
                }[keyof T & string]

/**
 * ConfigPath<T>
 * - Object property dot-paths only
 * - Optional properties are structural (a?: {b?: {c}} => "a.b.c" allowed)
 * - Arrays are leaf nodes (you can use "tags" but not "tags.0")
 * - Union types are permissive: a path is allowed if it exists in ANY union member
 *
 * This is designed for configuration authoring to prevent typos without being overly strict.
 */
export type ConfigPath<T, D extends number = 5> =
    Defined<T> extends any ? PathOneAny<Defined<T>, D> : never

/**
 * Value type at a ConfigPath (structural, runtime undefined is a separate concern).
 */
export type ConfigPathValue<T, P extends string> =
    P extends `${infer K}.${infer Rest}`
        ? K extends keyof Defined<T>
            ? ConfigPathValue<Defined<Defined<T>[K]>, Rest>
            : never
        : P extends keyof Defined<T>
            ? Defined<Defined<T>[P]>
            : never
