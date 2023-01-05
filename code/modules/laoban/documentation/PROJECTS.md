# Projects

A laoban project is a directory with a `project.details.json` file in it. This project MUST be under a directory that
has a [`laoban.json`](LAOBAN.JSON.md) file in it.

## Typical `project.details.json`

```json
{
  "template":    "typescript",
  "name":        "laoban",
  "description": "A cli for managing projects that have many npm packages",
  "details":     {
    "links": [
      "@laoban/variables", "@laoban/generations", "@laoban/validation", "@laoban/debug", "@laoban/files"
    ],
    "tsc":   true,
    "test":  true,
    "publish": true
  }
}
```
| Name | Purpose
| --- | --- |
|[template](TEMPLATES.md) | This examples 'what type of project this is'.
| name | The name of the project. This is the value that the project would be published to in `npmjs`
| description | Human readable description of the project.
| [details.links](#dependencies) | This is how we express 'This project depends on other projects'
| details.tsc/test/publish | These control if commands are executed in this project

## Project details file and variables
All the fields in a `project.details.json` file are available as [variables](VARIABLES.md) in scripts.

<a id='projects'></a>
## How do I find what projects exist

```shell
laoban projects
```
If we examine the results of this in the `laoban` project itself
```text
C:\git\laoban\code\modules\debug       => @laoban/debug       (remoteTypescript)
C:\git\laoban\code\modules\files       => @laoban/files       (typescript      ) depends on [@laoban/utils]
C:\git\laoban\code\modules\generations => @laoban/generations (typescript      ) depends on [@laoban/debug,@laoban/utils]
C:\git\laoban\code\modules\laoban      => laoban                 (typescript      ) depends on [@laoban/variables,@laoban/generations,@laoban/validation,@laoban/debug,@laoban/
files]
C:\git\laoban\code\modules\utils       => @laoban/utils       (typescript      )
C:\git\laoban\code\modules\validation  => @laoban/validation  (typescript      )
C:\git\laoban\code\modules\variables   => @laoban/variables   (typescript      )
```
Each line corresponds to a project. We can see the directory and the npm name of the project.
The value in (brackets) is the [template](TEMPLATES.md) of the project
The dependencies between the projects are shown at the end.

<a id='dependencies'></a>
## What are project dependencies?
Each `laoban project` can depend on others. This is important for things like 'compilation order'. If we are compiling
all the projects we want to compile the dependent projects first. 

Dependencies are specified in the `project.details.json` file. A sample is shown here

Note that the links reference the `name` of the project not the directory. With a javascript project this is the 
name that would be present in [npmjs](https://www.npmjs.com).

## How can I use the project dependencies

You can execute any script in `link order` by
```shell
laoban helloWorld -l
```

## How can I see what order the commands will be executed in

Adding the `-g` option says `display the generation plan`. This will show the order that the 
```shell
laoban helloWorld -lg
```

```text
Generation 0 modules\debug, modules\utils

Generation 1 modules\files, modules\generations, modules\variables, modules\validation

Generation 2 modules\laoban
```
This is telling us that all the projects in generation 0 will be executed before the projects in generation 1 and so on.

## How do I make a project from scratch

* Create a subdirectory under the directory that holds the `laoban.json` file. 
* Add to a file called `project.details.json` (I usually copy an existing one)
* Decide what template it should be
* Make sure that the name and description are filled in correctly
* Add in any `links` if the project depends on another project
* Execute `laoban update`

You should be able to see the project now if you execute `laoban projects`

## Typical `project.details.json`

* `template` is the name of the subdirectory that holds the configuration files that laoban will place in the project
* `name` is the name of the project. This is injected into package.json by update
* `description` is the name of the project. This is injected into package.json by update
* `details.extraDeps` are the names of dependancies that this project needs and are to be added to the template
* `details.extraDevDeps` are the names of developer dependancies that this project needs and are to be added to the template
* `details.links` are used within the 'master project' that laoban is looking after. * It allows laoban to set up symbolic links
  so that changes in one project are immediately reflected * These are added as dependencies to the project, with the '
  current version number'
* `details.tsc` Should this project be compiled with the typescript compiler
* `details.test` should this project be testing by `npm test`
* `details.publish` should this project be affected by commands with the guard condition ${projectDetails.details.publish}. Typically these are projects to be published to npmjs * typicall commands are `laoban pack`, `laoban publish`, `laoban ls-publish`

## Status

As described in [Scripts](SCRIPTS.md#complexCommands) some commands set `status` to true,
 which means that the success or failure of the last run will be remembered and displayed 
when you run `laoban status`.

Examples of this are `laoban tsc`, `laoban test` and `laoban publish`.

## Profiling
For general interest the times of the `status` scripts is recorded and 
can be seen with `laoban profile`. Each project is shown twice: once in `average`
and once in `latest`.

