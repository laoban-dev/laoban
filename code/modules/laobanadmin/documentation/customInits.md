
# Making your own 'inits'
At the moment it is still extremely experimental. It works for the default inits. It needs some work to make
it more suitable for general use. The documentation is here

If you have made your own templates and `laoban.json` and want `laoban-admin` to detect then then you need to set up
an 'init'. At the moment it is still extremely experimental. It works for the default inits. It needs some work to make
it more suitable for general use.

There are three parts to this.
See [the default implementation](https://github.com/phil-rice/laoban/tree/master/common/init) for an example

## The `allInits.json` file

This is pointed to by either the `-i` option, or the `LAOBANINITURL` environment variable. It is a json file that has a
list of `init` objects. Each `init` object has a name and a urlOrFile.

### Example

```json
{
  "typescript_react": "@laoban@/init/typescript_react",
  "typescript":       "@laoban@/init/typescript",
  "typescript_405":   "@laoban@/init/typescript_405",
  "javascript":       "@laoban@/init/javascript_core"
}
```

## A directory for each init and a '.init.json' file in each

This has a number of fields, they are all optional

| Field | Purpose |
| --- | --- |
| `markers` | If this is defined the init can be used|
|`parents` | Links to parent `inits`
|`laoban.json` | Json to be added to the `laoban.json` file
|`project.details.json` | Json to be added to the `project.details.json` file

### Example

```json
{
  "markers":              ["json:projectJson.devDependencies.typescript"],
  "parents":              [
    "@laoban@/init/javascript_core"
  ],
  "laoban.json":          {
    "packageManager": "yarn",
    "parents":        [
      "@laoban@/laoban.json/typescript.laoban.json",
      "@laoban@/laoban.json/typescript.publish.laoban.json"
    ]
  },
  "project.details.json": {
    "guardfile":     "project.json",
    "variableFiles": {"projectJson": "project.json"},
    "contents":      {
      "template":    "typescript",
      "name":        "${projectJson.name}",
      "description": "${projectJson.description}",
      "details":     {
        "publish": false,
        "tsc":     true,
        "test":    true,
        "links":   []
      }
    }
  }
}
```

### Markers

These are how we decide 'this project needs this template'. The prefix `json:projectJson.` is used to indicate that we
are looking in the `package.json` file in the project that we are trying to decide if this template is suitable for.

### Parents

This is a very powerful feature that allows us just to include the 'extras' in this `init` and not have to repeat.

