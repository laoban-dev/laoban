
# Starting with a greenfield site

## The simplest way

* Create a directory that is the root of your mono-repo
* `loaban init --force`

This creates a `laoban.json` file, but it has errors in it! Open it in your editor and correct the errors. For example
here we need to set the license string and the repository.

```json
{
  "packageManager": "yarn",
  "parents":        [
    "@laoban@/laoban.json/core.laoban.json",
    "@laoban@/laoban.json/javascript.laoban.json",
    "@laoban@/laoban.json/typescript.laoban.json",
    "@laoban@/laoban.json/typescript.publish.laoban.json",
    "@laoban@/laoban.json/react.laoban.json"
  ],
  "properties":     {
    "license":    "//LAOBAN-UPDATE-ERROR Making laoban.json Ref is ${projectJson.license}. no value found. Value was undefined",
    "repository": "//LAOBAN-UPDATE-ERROR Making laoban.json Ref is ${projectJson.repository}. no value found. Value was undefined"
  },
  "templates":      {
    "javascript":       "@laoban@/templates/javascript",
    "typescript":       "@laoban@/templates/typescript_405",
    "typescript_react": "@laoban@/templates/typescript_react"
  }
}
```

## OR Make first project(s) first

* Create a directory that is the root of your mono-repo
* Create a 'modules' directory (or other name) to act as the root of your projects
* Create your first project(s) (with a package.json)
* `loaban init --force`