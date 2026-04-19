# Laoban Config

This package contains the types, validators, and loader for `laoban.json`, the workspace-level configuration file for Laoban.

`laoban.json` is the workspace configuration root. It defines workspace-wide settings such as shared properties, templates, scripts, defaults, and parent configuration files. It is distinct from `package.details.json`, which remains the source of truth for module-local intent.

## What the config represents

There are two related shapes.

### `LaobanConfigFile`

This is the raw shape of a single `laoban.json` file as it appears on disk.

It is intentionally weak:

- all fields are optional
- each field must still have the correct type if present
- `scripts`, if present, are in raw form as `RawLaobanScripts`

This is the type used while loading and recursively resolving parent configuration files.

### `LaobanConfig`

This is the final effective configuration after:

- parent config files have been recursively loaded
- all configs have been merged
- defaults have been applied
- raw scripts have been normalised into `LaobanScripts`
- the final result has been strongly validated

This is the shape the rest of the system should normally consume.

## Main types

The main types are:

- `LaobanConfig`
- `LaobanConfigFile`
- `LaobanConfigLoadConfig`
- `LoadedLaobanConfig`
- `LaobanConfigDiagnosticContext`
- `LaobanConfigLoadArea`

## Validation model

There are two validators.

### `validateConfigFileContents`

This is the weak validator used during loading.

Use it when reading a single file from disk.

It checks that:

- the file is an object
- if fields are present, they have the correct type
- if `scripts` is present, it is valid as `RawLaobanScripts`

This allows sparse config files while still failing early on malformed content.

### `validateLaobanConfig`

This is the strong validator used after loading.

Use it after:

- recursively loading parents
- merging the config chain
- applying defaults
- normalising raw scripts into full scripts

It checks that the final effective config is complete and correctly typed.

## How loading works

`loadLaobanConfig(...)` performs the full loading flow.

At a high level it does this:

1. find the active `laoban.json`
2. load one file
3. parse JSON
4. weakly validate that file
5. recursively load and weakly validate its parents
6. merge parent configs and local config
7. apply defaults
8. normalise raw scripts into full scripts
9. strongly validate the final config
10. return the fully loaded config plus provenance information

## Observability

Loading requires an `Observability`.

You should already have one.

The loader does not create observability for you. It expects it to be supplied as part of `LaobanConfigLoadConfig`.

The loader uses observability for:

- debug logging during discovery, loading, parsing, parent resolution, merge, and final validation
- attaching diagnostic context to errors

The diagnostic context used by the loader is:

```ts
type LaobanConfigDiagnosticContext = Readonly<{
    currentFile?: Filename;
    loadPath: Filename[];
}>;
```

This tells you:

- which file is currently being processed
- how that file was reached through the parent chain

## Loading a config

Typical usage looks like this:

```ts
import { loadLaobanConfig } from "./laoban.config.loader";
import { someFileOps } from "@laoban/files";
import { someObservability } from "@laoban/observability";

const result = await loadLaobanConfig(
  {
    fileOps: someFileOps,
    observability: someObservability,
    markerFileName: "laoban.json",
  },
  "/some/start/directory"
);
```

The second argument is the place to start searching from. This can be a file or directory.

The loader uses `fileOps.findContainingDirectory(...)` to locate the directory containing the active `laoban.json`.

## Result shape

On success you get:

```ts
type LoadedLaobanConfig = {
  config: LaobanConfig;
  configFile: Filename;
  configDirectory: DirectoryName;
  loadedFiles: Filename[];
}
```

This gives you:

- the final effective config
- the active config file
- the config directory
- the full list of config files loaded, including parents

## Error provenance

Errors returned by the loader are enriched with diagnostic context.

This means that parse errors, weak validation errors, and final validation errors can all tell you:

- the file involved
- the load path used to reach that file

That makes nested parent-loading failures much easier to understand.

## Defaults

If a field is not supplied by the merged config chain, the loader applies these defaults:

```ts
{
  packageManager: "yarn",
  versionFile: "version.txt",
  parents: [],
  properties: {},
  templates: {},
  defaultEnv: {},
  scripts: {},
  skipDirectories: [".git", "node_modules"]
}
```

## Scripts

Scripts are loaded in two stages.

In `LaobanConfigFile`, scripts are raw and use `RawLaobanScripts`.

That means each script is written in the user-facing form from `laoban.json`, for example:

```json
{
  "scripts": {
    "build": {
      "description": "build the project",
      "commands": ["yarn build"]
    }
  }
}
```

During loading, these raw scripts are normalised into `LaobanScripts`.

For example, the command string shorthand above becomes:

```json
{
  "scripts": {
    "build": {
      "description": "build the project",
      "commands": [
        {
          "command": "yarn build",
          "status": false
        }
      ],
      "inLinksOrder": false,
      "showShell": false,
      "commandArgs": {},
      "env": {}
    }
  }
}
```

So the final `LaobanConfig` always contains the full normalised script model.

## Design notes

A few important points:

- `laoban.json` is workspace-level config
- `package.details.json` is module-level config
- parent config files are recursively composed
- local config overrides parent config according to merge rules
- validation is deliberately split into weak file validation and strong final validation
- script loading is split into raw validation and later normalisation
- loading is explicit and uses injected abstractions

## What you need to provide

To load config you need:

- `FileOps`
- `Observability`
- a start location
- usually `"laoban.json"` as the marker file name

That is enough to fully load the effective workspace configuration.
