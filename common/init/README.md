These are currently 'aspirational files'. i.e. I am thinking about to make it easy for
the first five minutes with `laoban`

The intention is that installing and getting going with a project is

```shell
laoban init typescript   # Note that 'typescript will point to the init subdirectory 'typescript' which points to the latest version of typescript

laoban init typescript java # Here we are more ambitious.
``` 
This should create a suitable `laoban.json` and in every child directory that has a `package.json` it will
add a `package.details.json` extracting the name and description from the existing `package.json`.

In the second example it's more complex. We need to merge things so that we can create the write parents in the
`laoban.json` and different `project.details.json`

It _should_ also populate the `dependencies` and `devDependencies` and some other things... 
But really this should be done in a template. Still it gets going quickly.

We obviously need a `--preview` which instead of creating the files just dumps them to the output... 

# Implementation

Probably start with the 'notemplate' so that we can just 'get running'. That's actually pretty cool... lets templates 
be added later. That would mean that we don't do anything with package.json... 
and means that updating version numbers is thus a pain.






