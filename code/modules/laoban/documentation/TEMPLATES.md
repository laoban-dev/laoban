# Templates

Each [project](PROJECTS.md) has a `template`. This template tells us 'what sort of project it is'.
For example we might want the following: 
* Java projects (for the backend)
* Typescript non react projects (which are libraries)
* Typescript react projects (for the front end)

Here we would have three templates. `java`, `typescript` and `react`.

## What do templates do...
A template is a list of files that will be copied into our project every time 
we execute the `laoban update` command. The files can be configured to be modified
during the update command

This allows us to manage all these files centrally, but allows us to have local variations
For example. Typical files in a template include
* project.json
* pom.xml
* babel.config.json
* ts-config.json

## Why are they cool
As soon as you want to upgrade a version of a dependency in many projects, you discover the
joy of the templates. They are 'managed' in the template, type `laoban update` and it is the
same as editing the `package.json` everywhere. 

With them it is now trivial to create sub libraries which is great for increasing code
quality (libraries typically force us to create nice interfaces and decouple our code). Normally
this is painful in the javascript ecosystem

## Templates and [project.details.json](PROJECTS.md)
Often the files in the template will be modified by the data in the `project.details.json`
file. For example the name of the project is needed in `pom.xml` and `project.json`.

## Local templates
Often when starting we just want really simple templates. In this case we create a folder (usually
called `templates`). Under it we create a directory with the name of the template. And in this 
we just put the files we want copied. 

By default  `laoban` will 'do sensible things' to `project.json`

## Remote templates
As our projects mature, or if we are in a big organisation, we might want to have centralised
control of these templates. For example as company we might want to say `this is what a react project should look like`.

For these we can use a slightly more sophisticated approach to template management by
editing [laoban.json](LAOBAN.JSON.md) and adding a `templates` section. (Note 
that this is totally optioanal: you will know if you need to do it, if in doubt just use the simple
approach)

```json
{"templates": {
   "react": "https://some url that points to the template",
   "java": "it can point to a directory as well (relative to the root of your project"
}
}
```
This isn't an either/or. You can have a `templates` and still have local directory templates.

## Template control files

When we are using the `templates` approach rather than a directory, then we need a `template control file`

Suppose we have 
```json
  "templates":      {
    "remoteTypescript": "https://raw.githubusercontent.com/phil-rice/laoban/master/common/templates/typescript",
    "localTypescript": "templates/typescript"
  },
``` 

There must be a `template control file` at the url or directory plus `.template.json`.
This is a list of files that will be copied to the destination.


In this case at this [file location](https://raw.githubusercontent.com/phil-rice/laoban/master/common/templates/typescript/.template.json)
```json
{
  "files": [
    ".npmrc",
    "babel.config.json",
    "jest.config.json",
    "package.json",
    "tsconfig.json"
  ]
}
```

It doesn't have to be a url in `templates` it can be a directory instead
