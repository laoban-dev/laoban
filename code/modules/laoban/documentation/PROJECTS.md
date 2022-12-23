# Projects

A laoban project is a directory with a `project.details.json` file in it. This project MUST be under a directory that
has a [`laoban.json`](LAOBAN.JSON.md) file in it.

## Project details file and variables
All the fields in a `project.details.json` file are available as [variables](VARIABLES.md) in scripts.

## How do I find what projects exist

```shell
laoban projects
```
If we examine the results of this in the `laoban` project itself
```text
C:\git\laoban\code\modules\debug       => @phil-rice/debug       (remoteTypescript)
C:\git\laoban\code\modules\files       => @phil-rice/files       (typescript      ) depends on [@phil-rice/utils]
C:\git\laoban\code\modules\generations => @phil-rice/generations (typescript      ) depends on [@phil-rice/debug,@phil-rice/utils]
C:\git\laoban\code\modules\laoban      => laoban                 (typescript      ) depends on [@phil-rice/variables,@phil-rice/generations,@phil-rice/validation,@phil-rice/debug,@phil-rice/
files]
C:\git\laoban\code\modules\utils       => @phil-rice/utils       (typescript      )
C:\git\laoban\code\modules\validation  => @phil-rice/validation  (typescript      )
C:\git\laoban\code\modules\variables   => @phil-rice/variables   (typescript      )
```
Each line corresponds to a project. We can see the directory and the npm name of the project.
The value in (brackets) is the [template](TEMPLATES.md) of the project
The dependencies between the projects are shown at the end.

## What are project dependencies?
Each `laoban project` can depend on others. This is important for things like 'compilation order'. If we are compiling
all the projects we want to compile the dependent projects first. 

Dependencies are specified in the `project.details.json` file. A sample is shown here
```json
{
  "template"   : "typescript",
  "name"       : "laoban",
  "description": "A cli for managing projects that have many npm packages",
  "details"    : {
    "links"       : ["@phil-rice/variables","@phil-rice/generations", "@phil-rice/validation", "@phil-rice/debug","@phil-rice/files"]
  }
}
```
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