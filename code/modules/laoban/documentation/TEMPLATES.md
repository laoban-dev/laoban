# Templates

Each [project](PROJECTS.md) has a `template`. This template tells us 'what sort of project it is'. For example we might
want the following:

* Java projects (for the backend)
* Typescript non react projects (which are libraries)
* Typescript react projects (for the front end)

Here we would have three templates. `java`, `typescript` and `react`.

## What do templates do...

A template is a list of files that will be copied into our project every time we execute the `laoban update` command.
The files can be configured to be modified during the update command

This allows us to manage all these files centrally, but allows us to have local variations For example. Typical files in
a template include

* project.json
* pom.xml
* babel.config.json
* ts-config.json

## Why are they cool

As soon as you want to upgrade a version of a dependency in many projects, you discover the joy of the templates. They
are 'managed' in the template, type `laoban update` and it is the same as editing the `package.json` everywhere.

With them it is now trivial to create sub libraries which is great for increasing code quality (libraries typically
force us to create nice interfaces and decouple our code). Normally this is painful in the javascript ecosystem

## Templates and [project.details.json](PROJECTS.md)

Often the files in the template will be modified by the data in the `project.details.json`
file. For example the name of the project is needed in `pom.xml` and `project.json`.

## Templates are in the `laoban.json` file

In the `laoban.json` file we have a `templates` section. For example:

```json
{
  "templates": {
    "javascript":       "./templates/javascript",
    "typescript":       "@laoban@/templates/typescript_405",
    "typescript_react": "https://raw.githubusercontent.com/phil-rice/laoban/master/common/templates/typescript_react/.template.json"
  }
}
```

* The first is the declaration of a `local template` that lives in the `monorepo`.
* The second is a url. The `@laoban@` is a shortcut
  for `https://raw.githubusercontent.com/phil-rice/laoban/master/common`
* The third is also a url

### The file `.template.json`

The url specified in the `templates` section of `laoban.json` has 'template.json' appended to it. There should be a file
defined there. Typical contents might be:

```json
{
  "files": [
    "tsconfig.json",
    {
      "file":        "@laoban@/templates/typescript/.npmrc",
      "target":      ".npmrc",
      "postProcess": "checkEnv(NPM_TOKEN)"
    },
    {
      "file":   "@laoban@/templates/typescript/babel.config.json",
      "target": "babel.config.json"
    },
    {
      "file":   "@laoban@/templates/typescript/jest.config.json",
      "target": "jest.config.json"
    },
    {
      "file":        "package.json",
      "type":        "${}",
      "postProcess": "jsonMergeInto(@laoban@/templates/javascript/package.json,@laoban@/templates/typescript_405/package.json)"
    }
  ]
}
```

Let's look at these in more details

### Just a filename

```json
  {
  "files": [
    "tsconfig.json"
  ]
}
```
The same url prefix is put in front of this, and that file is 'just copied'. In this 
example. `https://raw.githubusercontent.com/phil-rice/laoban/master/common/templates/typescript_405/tsconfig.json` is
copied to `tsconfig.json`

### file and target
```json
    {
      "file":   "@laoban@/templates/typescript/babel.config.json",
      "target": "babel.config.json"
    }
```
In this example the file is copied from the `file` to the `target`. The `file` is a url or 
actual file, and the target is where the file is to be copied to in the target project

### file/target and post process
Sometimes we want to 'post process' the file. There are currently three post processors

* `json`. This will turn the file into json and backend. This has the property of getting rid of any duplicates and pretty printing the file
* `checkEnv(...)`. This checks that the environment variable in the bracket exists. This gives your user a much nicer experience as the error message tells them they need to set up their environment variable
* `jsonMergeInto(file1,file2)` The parent files are loaded and then there is a json merge. This makes it very easy to make 'master files' and just record the small differences

