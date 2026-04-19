# README.AI.md

This file is for AI-assisted editing of `@laoban/template`.

Its purpose is to show **how to use the code correctly**.

## Main imports

Use these imports unless there is a clear reason not to:

```ts
import { renderTemplate } from "./template.engine";
import {
  dollarsBracesVarDefn,
  mustachesVarDefn,
  colonPrefixedVarDefn,
  doubleAngleVarDefn,
  type Template,
  type TemplateConfig,
  type TemplateFn,
  type TemplateFns,
  type TemplateIssue,
} from "./template.types";
import { defaultTemplateFns } from "./template.functions";
import { replaceTemplateToken } from "./template.replace";

import { value, errors, isErrors, isValue, type ErrorsOr } from "@laoban/errors";
import { nullObservability } from "@laoban/observability";
```

## Most common usage

The common case is:

```ts
const dictionary = {
  packageDetails: {
    name: "@laoban/template"
  }
};

const result = renderTemplate(
  "Hello ${packageDetails.name|toUpperCase}",
  dictionary
);
```

Expected result:

- `result` is `ErrorsOr<string, TemplateIssue>`
- the value branch should contain `"Hello @LAOBAN/TEMPLATE"`

## Usage with explicit config

Use explicit config when you need to override syntax, missing-value behaviour, functions, or observability.

```ts
const dictionary = {
  version: "1.2.3",
  packageDetails: {
    name: "@laoban/template"
  }
};

const config: Partial<TemplateConfig<typeof dictionary>> = {
  variableDefn: dollarsBracesVarDefn,
  onMissing: "keep",
  functions: defaultTemplateFns<typeof dictionary>(),
  observability: nullObservability()
};

const result = renderTemplate(
  "name=${packageDetails.name}, version=${version}",
  dictionary,
  config
);
```

## Quoted dotted keys

If a dictionary key contains a dot, quote that segment:

```ts
const dictionary = {
  "package.json": {
    name: "@laoban/template"
  }
};

const result = renderTemplate(
  "name=${'package.json'.name|toUpperCase}",
  dictionary
);
```

## Alternative syntax

The engine supports configurable syntax through `variableDefn`.

Example with mustache syntax:

```ts
const dictionary = {
  packageDetails: {
    name: "@laoban/template"
  }
};

const result = renderTemplate(
  "Hello {{packageDetails.name}}",
  dictionary,
  {
    variableDefn: mustachesVarDefn
  }
);
```

## Missing values

`onMissing` controls behaviour when path resolution fails.

Supported modes:

- `"error"`
- `"warning"`
- `"empty"`
- `"keep"`

Example:

```ts
const result = renderTemplate(
  "value=${missing.value}",
  {},
  { onMissing: "keep" }
);
```

Expected rendered value:

```ts
"value=${missing.value}"
```

Important rule:

If path resolution fails, `onMissing` is applied **before** any function execution.

So this:

```ts
"${missing.value|default(no description)}"
```

does **not** call `default(...)` if the path is already missing.

## Custom functions

Custom functions are passed in through `config.functions`.

A template function receives:

- `value`
- `dictionary`
- `params`
- `expression`
- `functionName`
- `config`

Example:

```ts
import { value } from "@laoban/errors";

const functions = {
  trim: ({ value: v }) => value(String(v).trim()),
  surround: ({ value: v, params }) => value(`${params[0]}${String(v)}${params[1]}`)
};

const result = renderTemplate(
  "value=${name|trim|surround([,])}",
  { name: "  Phil  " },
  { functions }
);
```

## Replacing one token only

Use `replaceTemplateToken(...)` when working on one token such as `${path|fn}`.

```ts
const dictionary = {
  packageDetails: {
    name: "@laoban/template"
  }
};

const config = {
  variableDefn: dollarsBracesVarDefn,
  onMissing: "error" as const,
  functions: defaultTemplateFns<typeof dictionary>(),
  observability: nullObservability()
};

const result = replaceTemplateToken(
  "${packageDetails.name|toUpperCase}",
  dictionary,
  config
);
```

## Error monad rules

Use the existing monad from `@laoban/errors`.

Use:

- `value(...)`
- `errors(...)`
- `isErrors(...)`
- `isValue(...)` when helpful

Return:

- `ErrorsOr<T, TemplateIssue>`

Example:

```ts
if (trimmed.length === 0) {
  return errors(
    makeTemplateIssue("invalidExpression", "Template expression has an empty path", {
      expression: path
    })
  );
}
```

Important:

`errors(...)` takes:

```ts
errors(first, rest?, warnings?, reference?)
```

Do **not** call:

```ts
errors([issue])
```

## Observability rules

Observability is explicit in `TemplateConfig<T>`.

Use:

```ts
observability: nullObservability()
```

not:

```ts
observability: nullObservability
```

Both the renderer and template functions receive observability through config.

Do not use ambient logging or console logging in core logic.

## File responsibilities

Use the files like this:

### `template.types.ts`

Owns:

- public types
- variable definitions
- `makeTemplateIssue`

### `template.functions.ts`

Owns:

- built-in default functions only

### `template.replace.ts`

Owns:

- replacement of a single token
- parsing one expression
- path lookup
- function pipeline
- `onMissing` handling

### `template.engine.ts`

Owns:

- rendering a whole template
- merging default config
- scanning for tokens and calling `replaceTemplateToken(...)`

## Defaults

Defaults are merged in `template.engine.ts`.

Defaults are:

- `variableDefn`: `dollarsBracesVarDefn`
- `onMissing`: `"error"`
- `functions`: built-in default functions
- `observability`: `nullObservability()`

This supports the rule:

**the simple is simple, and the complex is possible**

## Do not do these things

- do not duplicate the error monad
- do not invent wrapper abstractions around `value(...)` unless explicitly asked
- do not call the dictionary `context`
- do not hard-wire observability
- do not put default functions in `template.replace.ts`
- do not merge defaults outside `template.engine.ts`
- do not create extra files unless asked

## Testing guidance

When writing tests:

- use `renderTemplate(...)` for full-template behaviour
- use `replaceTemplateToken(...)` for single-token behaviour
- use `nullObservability()` in test config
- use `isErrors(...)` / `isValue(...)` from `@laoban/errors`
- test quoted dotted keys like `${'package.json'.name}`
- test `onMissing`
- test that omitted config uses defaults

## Short examples to copy

### Simple render

```ts
const result = renderTemplate("Hello ${name}", { name: "Phil" });
```

### Keep missing values

```ts
const result = renderTemplate("Hello ${name}", {}, { onMissing: "keep" });
```

### Mustache syntax

```ts
const result = renderTemplate("Hello {{name}}", { name: "Phil" }, { variableDefn: mustachesVarDefn });
```

### Custom function

```ts
const result = renderTemplate(
  "Hello ${name|toUpperCase}",
  { name: "Phil" },
  {
    functions: {
      ...defaultTemplateFns<{ name: string }>(),
      toUpperCase: ({ value: v }) => value(String(v).toUpperCase())
    }
  }
);
```
