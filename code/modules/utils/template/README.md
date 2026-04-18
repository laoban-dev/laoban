# @laoban/template

Generic template rendering for derived files, with configurable variable syntax, path-based lookup, transforms, and structured warnings/errors.

## Why this exists

Laoban generates derived files such as:

- `package.json`
- `tsconfig.json`
- `jest.config.json`
- `.env`
- `pom.xml`

Those files need values drawn from structured data such as workspace configuration, module metadata, and generation-time variables.

`@laoban/template` is the small core that turns:

```text
{
  "name": "${packageDetails.name}",
  "version": "${version}"
}
```

into rendered output using a supplied context object.

This package is intentionally small. It is not a file loader, not a project discovery mechanism, and not a general workflow engine. It is just the rendering core.

## Design goals

The design is shaped by a few simple rules:

- keep the common case simple
- allow richer behaviour without turning the engine into a mess
- keep token recognition separate from expression resolution
- keep the engine generic over context shape
- report structured warnings and errors instead of relying only on exceptions
- make delimiter syntax configurable

## Main idea

The engine renders template text against a generic context.

A template contains variable markers such as:

```text
Hello ${packageDetails.name}
```

The engine:

- finds variable markers in the text
- extracts the expression inside them
- resolves that expression against the supplied context
- optionally applies functions/transforms
- returns rendered text plus any warnings/errors

## Public types

```ts
export type Template<T> = {
    raw: string
}

export type VariableDefn = {
    regex: RegExp
    removeStartEnd: (raw: string) => string
}

export type RenderOptions<T> = {
    onMissing?: 'error' | 'warning' | 'empty' | 'keep'
    functions?: Record<string, TemplateFunction<T>>
    variableDefn?: VariableDefn
}

export type TemplateFunction<T> = (args: {
    value: unknown
    context: T
    params: string[]
}) => unknown

export type TemplateIssue = {
    path: string[]
    message: string
    severity: 'warning' | 'error'
    expression?: string
}

export type RenderResult = {
    text: string
    warnings: TemplateIssue[]
    errors: TemplateIssue[]
}

export type TemplateEngine =
    <T>(template: Template<T> | string, context: T, options?: RenderOptions<T>) => RenderResult
```

## Why the context is generic

The template engine must not assume one fixed Laoban context shape.

Different callers may want different context objects:

- full workspace + module metadata
- a small context for one generated file
- an enriched context with temporary values
- a context created for nested rendering

So the engine is generic in `T`:

```ts
export type TemplateEngine =
    <T>(template: Template<T> | string, context: T, options?: RenderOptions<T>) => RenderResult
```

This keeps the engine reusable and avoids baking Laoban-specific structure into the core.

## Variable syntax is configurable

One of the useful ideas in the old implementation was that variable syntax should not be hard-coded.

Different formats and sub-languages can want different delimiters. The engine therefore separates:

- how variables are recognised in text
- what the contents of those variables mean

That is the purpose of `VariableDefn`.

Example definitions:

```ts
export const dollarsBracesVarDefn: VariableDefn = {
    regex: /(\$\{[^}]*\})/g,
    removeStartEnd: s => s.slice(2, -1)
}

export const mustachesVarDefn: VariableDefn = {
    regex: /(\{\{.*?\}\})/g,
    removeStartEnd: s => s.slice(2, -2)
}

export const colonPrefixedVarDefn: VariableDefn = {
    regex: /(:[a-zA-Z0-9._]+)/g,
    removeStartEnd: s => s.slice(1)
}

export const doubleAngleVarDefn: VariableDefn = {
    regex: /(<<[^>]*>>)/g,
    removeStartEnd: s => s.slice(2, -2)
}
```

Typical default is `${...}`, but the engine should not depend on that being the only valid syntax.

## Expressions

The first intended expression form is a dotted path into the supplied context.

Examples:

- `${version}`
- `${packageDetails.name}`
- `${packageDetails.guards.compile}`
- `${workspace.properties.react}`

These are resolved at runtime from the template text.

## Missing values

Missing values need explicit behaviour.

The engine supports:

```ts
onMissing?: 'error' | 'warning' | 'empty' | 'keep'
```

Meaning:

- `error`  
  record an error for missing values

- `warning`  
  record a warning but continue

- `empty`  
  replace missing values with an empty string

- `keep`  
  leave the original template marker in place

This is much clearer than mixing exceptions, magic strings, and several boolean flags.

## Structured issues

Rendering returns both text and issues:

```ts
export type RenderResult = {
    text: string
    warnings: TemplateIssue[]
    errors: TemplateIssue[]
}
```

This is deliberate.

Template failures are usually configuration or data problems, not necessarily programmer bugs. The engine should therefore provide structured diagnostics that higher-level Laoban code can report cleanly.

A `TemplateIssue` includes:

- `path` for structured location/context
- `message` for human-readable explanation
- `severity`
- `expression` when relevant

This matches the wider Laoban direction of explicit, composable error handling.

## Functions / transforms

Simple substitution is not always enough. Templates often need some lightweight value transformation.

That is why `RenderOptions` allows caller-supplied functions:

```ts
functions?: Record<string, TemplateFunction<T>>
```

A function receives:

- the current value
- the whole context
- any parsed parameters

```ts
export type TemplateFunction<T> = (args: {
    value: unknown
    context: T
    params: string[]
}) => unknown
```

This keeps the engine small while still making custom behaviour possible.

The core package provides the mechanism, not necessarily a large built-in function library.

## Why the engine is a function type

The engine has one main responsibility: render.

So the public abstraction is a function, not an object with methods:

```ts
export type TemplateEngine =
    <T>(template: Template<T> | string, context: T, options?: RenderOptions<T>) => RenderResult
```

That keeps the surface area small and makes the intent obvious.

It also fits the wider Laoban preference for small composable pieces rather than large service objects.

## Expected internal structure

Even though the public API is tiny, the implementation should still separate concerns.

A likely internal breakdown is:

### Token extraction

Find occurrences of the current `VariableDefn` inside text.

### Expression extraction

Strip delimiters and get the raw expression text.

### Expression parsing

Interpret the raw expression, initially as:

- a dotted path
- optionally followed by transforms

### Resolution

Resolve the path against the supplied context.

### Rendering

Convert the resolved value into output text.

### Issue accumulation

Collect warnings and errors into the final `RenderResult`.

The previous implementation became hard to evolve because too many of these responsibilities were mixed together.

## Intended initial scope

The first version should stay small.

### In scope

- configurable variable delimiters
- dotted path lookup
- configurable missing-value behaviour
- structured warnings/errors
- optional transform mechanism

### Not initially in scope unless clearly needed

- many bespoke mini-languages
- multiple overlapping command syntaxes
- control flow embedded everywhere
- deep template DSL behaviour
- file loading/writing
- workspace/module discovery

The aim is to avoid reproducing the accidental complexity of the old code.

## Example

Context:

```ts
const context = {
  version: "1.2.3",
  packageDetails: {
    name: "@laoban/template",
    guards: {
      compile: true
    }
  }
}
```

Template:

```ts
const template = `{
  "name": "${packageDetails.name}",
  "version": "${version}"
}`
```

Conceptual result:

```ts
{
  text: `{
  "name": "@laoban/template",
  "version": "1.2.3"
}`,
  warnings: [],
  errors: []
}
```

Missing value example:

```ts
const template = `compile=${packageDetails.guards.compile}
publish=${packageDetails.guards.publish}`
```

With `onMissing: 'warning'`, rendering can continue while still reporting that `packageDetails.guards.publish` was not present.

## Summary

`@laoban/template` is the small generic rendering core for Laoban derived files.

It provides:

- generic rendering over any context type
- configurable variable syntax
- path-based expression resolution
- optional transforms
- structured warnings and errors
- explicit missing-value behaviour

It is intentionally narrow in scope so that the rest of Laoban can build on it without being constrained by a large or messy templating subsystem.
