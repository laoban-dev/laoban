# @laoban/template

Generic template rendering for derived files.

This package renders template text against a supplied dictionary using:

- configurable variable syntax
- dotted-path lookup with escaping for dotted keys
- explicit template functions
- explicit observability
- structured `ErrorsOr` results with warnings

The design goal is that the simple is simple, and the complex is possible.

Most callers should be able to render a template using defaults. More advanced callers can override variable syntax, missing-value behaviour, functions, and observability explicitly.

## Quick start

A template such as:

```text
Hello ${packageDetails.name|toUpperCase}
```

or, when a key itself contains a dot:

```text
Hello ${'package.json'.name|toUpperCase}
```

can be rendered against a dictionary object.

If you are happy with the defaults, the simplest call is:

```ts
const dictionary = {
  packageDetails: {
    name: "@laoban/template"
  }
};

const result = defaultTemplateEngine(
  "Hello ${packageDetails.name|toUpperCase}",
  dictionary
);
```

Expected rendered value:

```text
Hello @LAOBAN/TEMPLATE
```

## How to call it

Call the engine with:

- a template string or `Template`
- a dictionary object
- an optional config object

Conceptually:

```ts
const result = defaultTemplateEngine(template, dictionary, config)
```

If no config is provided, the renderer uses sensible defaults:

- `variableDefn`: `dollarsBracesVarDefn`
- `onMissing`: `"error"`
- `functions`: the built-in default function set (created internally)
- `observability`: `nullObservability`

`defaultTemplateEngine` wires in built-in functions internally when `config.functions` is omitted.
The package root exports `defaultTemplateEngine` and types; `defaultTemplateFns` is not exported from `index.ts`.

This is the simple case.

If you need more control, pass an explicit config object. That is the complex-is-possible case.

Example:

```ts
const config = {
  variableDefn: dollarsBracesVarDefn,
  onMissing: "keep" as const,
  functions,
  observability
};

const result = defaultTemplateEngine(template, dictionary, config);
```

Rendering should not depend on hidden global function registries, ambient logging, or hard-wired metrics.

## Dictionary

The dictionary is generic.

That means you can render using whatever shape makes sense for the caller:

```ts
const dictionary = {
  version: "1.2.3",
  packageDetails: {
    name: "@laoban/template",
    guards: {
      compile: true
    }
  }
};
```

Example template:

```text
{
  "name": "${packageDetails.name}",
  "version": "${version}"
}
```

## Variable syntax

Variable syntax is configurable through `variableDefn`.

Example `${...}` syntax:

```ts
const dollarsBracesVarDefn = {
  regex: /(\$\{[^}]*\})/g,
  removeStartEnd: (raw: string) => raw.slice(2, -1)
};
```

Example `{{...}}` syntax:

```ts
const mustachesVarDefn = {
  regex: /(\{\{.*?\}\})/g,
  removeStartEnd: (raw: string) => raw.slice(2, -2)
};
```

Example `:name` syntax:

```ts
const colonPrefixedVarDefn = {
  regex: /(:[a-zA-Z0-9._]+)/g,
  removeStartEnd: (raw: string) => raw.slice(1)
};
```

Use the syntax that best matches the target file format and the risk of delimiter clashes.

## Expressions

The basic expression form is a dotted path into the supplied dictionary.

Examples:

```text
${version}
${packageDetails.name}
${packageDetails.guards.compile}
${workspace.properties.react}
```

If a key itself contains a dot, quote that segment:

```text
${'package.json'.name}
```

Functions are applied with pipe syntax:

```text
${packageDetails.name|toUpperCase}
${packageDetails.name|toLowerCase}
${description|default(no description)}
```

The meaning is:

1. resolve the path
2. apply the functions from left to right
3. render the final value

If path resolution fails, `onMissing` is applied before function execution.
That means `${missing.value|default(no description)}` will not call `default(...)`.

## Functions

Template functions are passed explicitly in config. If no functions are supplied, the renderer uses a default set of common string functions.

The default functions are:

- `urlEncode` — URL-encodes the current value
- `lastSegment` — returns the last segment of a slash-separated path
- `forwardSlashToDot` — replaces `/` with `.`
- `toLowerCase` — converts to lower case
- `toUpperCase` — converts to upper case
- `toTitleCase` — converts words to title case
- `toFirstUpper` — converts the first character to upper case
- `toSnakeCase` — converts camelCase to snake_case
- `toPackage` — replaces `.` with `/`
- `default` — returns the current value unless it is `undefined` or `null`, otherwise returns the first parameter

Example usage:

```text
${packageDetails.name|toUpperCase}
${module.path|forwardSlashToDot}
${description|default(no description)}
```

A template function receives:

- the current value
- the whole dictionary
- function parameters
- the full expression
- the function name
- the explicit config object

Conceptually:

```ts
type TemplateFn<T> = (args: {
  value: unknown
  dictionary: T
  params: string[]
  expression: string
  functionName: string
  config: TemplateConfig<T>
}) => ErrorsOr<unknown, TemplateIssue>
```

### Custom functions

You can replace or extend the defaults with your own function map.

Example:

```ts
import { value } from "@laoban/errors";

const functions = {
  trim: ({ value: v }) => value(String(v).trim())
};
```

## Observability

Observability is passed explicitly in config.

Both the renderer and the template functions receive observability explicitly. This allows logging, debug output, count metrics, and duration metrics to be aligned with template execution.

Example:

```ts
const config = {
  variableDefn: dollarsBracesVarDefn,
  onMissing: "error" as const,
  functions,
  observability
};
```

Typical uses include:

- debug logging for parse, resolve, and function steps
- count metrics for missing values and function calls
- duration metrics for render time and expensive functions

## Missing values

Missing values are controlled by `onMissing`.

Supported modes:

- `error`
- `warning`
- `empty`
- `keep`

### `error`

Record a structured error for the missing value.

### `warning`

Preserve the issue as a warning and continue.

### `empty`

Replace the missing value with an empty string.

### `keep`

Leave the original marker in the output.

Example:

```text
compile=${packageDetails.guards.compile}
publish=${packageDetails.guards.publish}
```

If `publish` is missing:

- `error` returns an error result
- `warning` returns a value with warnings
- `empty` renders `publish=`
- `keep` renders `publish=${packageDetails.guards.publish}`

## Result model

Rendering returns `ErrorsOr<string, TemplateIssue>`.

That means:

- successful rendering returns a string value
- successful rendering may also carry warnings
- expected rendering failures return structured issues
- failures are not represented primarily by exceptions

## Full example

This example does not rely on any defaults.

```ts
import { value } from "@laoban/errors";

const dollarsBracesVarDefn = {
  regex: /(\$\{[^}]*\})/g,
  removeStartEnd: (raw: string) => raw.slice(2, -1)
};

const functions = {
  toUpperCase: ({ value: v }) => value(String(v).toUpperCase()),
  default: ({ value: v, params }) =>
    value(v === undefined || v === null ? params[0] : v)
};

const dictionary = {
  version: "1.2.3",
  "package.json": {
    name: "@laoban/template"
  }
};

const config = {
  variableDefn: dollarsBracesVarDefn,
  onMissing: "error" as const,
  functions,
  observability
};

const template = `{
  "name": "${'package.json'.name|toUpperCase}",
  "version": "${version}",
  "description": "${description|default(no description)}"
}`;

const result = defaultTemplateEngine(template, dictionary, config);
```

Expected rendered output:

```json
{
  "name": "@LAOBAN/TEMPLATE",
  "version": "1.2.3",
  "description": "no description"
}
```

## Appendix: why it is shaped like this

This package is deliberately explicit.

- The dictionary is generic so callers are not forced into one fixed top-level shape.
- Variable syntax is configurable because different target file formats want different delimiters.
- Functions are passed explicitly rather than coming from a hidden registry.
- Observability is passed explicitly so logging, debug output, and metrics align with template execution.
- Rendering returns `ErrorsOr` so expected failures and warnings remain structured and composable.

The guiding idea is that the simple is simple, and the complex is possible.
