# Setting up an existing project

Overview:
* Open the command line, and change directory to the root of the git repo
* Use `laoban-admin projects` to see what projects are in the mono-repo
* Use `laoban-admin init --dryrun` to see what laoban files will be generated
* Use `laoban-admin init --force` To actually generate the laoban files
* Use `laoban update` to generate package.json
* Use `yarn` to make symbolic links
* Use `laoban tsc` to compile the project

## Existing project in mono-repo or under a single directory

In this scenario there are a number of javascript projects (defined as a directory
with a `package.json` file in it). `loaban-admin` will scan the directories
and decide 'what type of project' it is and select a suitable template for it.

It is quite possible for your company or organisation to define some new types of projects
and set it so that the scanning software will detect them. For example if half of your
projects are 'typescript + react + storybook' and others are 'typescript + express' then
you can define two new types of project and laoban-admin will detect them. Details below.
This is only worth doing 'for fun' or if you have a lot of projects.

## Exploring what we have

* Open the command line, and change directory to the root of the git repo
* Use `laoban-admin projects` to see what projects are in the mono-repo

Here is an example of doing this on the `laoban` code base
```shell
C:\git\laoban\code> laoban-admin  projects
Found an existing laoban.json file at C:\git\laoban\code
Would put laoban.json into  C:\git\laoban\code  which allows the following templates {
  javascript: '@laoban@/templates/javascript',
  typescript: '@laoban@/templates/typescript_405',
  typescript_react: '@laoban@/templates/typescript_react'
}
package.json                               Guessed Template
    C:\git\laoban\code/modules/debug       typescript
    C:\git\laoban\code/modules/files       typescript
    C:\git\laoban\code/modules/generations typescript
    C:\git\laoban\code/modules/laoban      typescript
    C:\git\laoban\code/modules/laobanadmin typescript
    C:\git\laoban\code/modules/utils       typescript
    C:\git\laoban\code/modules/validation  typescript
    C:\git\laoban\code/modules/variables   typescript
```

There are three parts to this.
### Part 1
```shell
Found an existing laoban.json file at C:\git\laoban\code
```
Laoban is telling is the place that it will put the 'root' of the projects in `c:\git\laoban\code`.
This is the directory that contains the existing `laoban.json` file.

`laoban-admin` uses a number of strategies to pick the best place to put the
root of the projects, and this is one of them.

### Part 2
```shell
Would put laoban.json into  C:\git\laoban\code  which allows the following templates {
  javascript: '@laoban@/templates/javascript',
  typescript: '@laoban@/templates/typescript_405',
  typescript_react: '@laoban@/templates/typescript_react'
}
```
This is a list of the templates that projects can use. A template is a 'type of projects'.
It is straightforwards to add more types of templates. They can be hosted pn a shared
disc drive, a disc drive managed in the mono-repo or a url. Projects that share the same
template are generally easier to manage

### Part 3
```shell
package.json                               Guessed Template
    C:\git\laoban\code/modules/debug       typescript
    C:\git\laoban\code/modules/files       typescript
    C:\git\laoban\code/modules/generations typescript
    C:\git\laoban\code/modules/laoban      typescript
    C:\git\laoban\code/modules/laobanadmin typescript
    C:\git\laoban\code/modules/utils       typescript
    C:\git\laoban\code/modules/validation  typescript
    C:\git\laoban\code/modules/variables   typescript
```
There there is a list of projects that have been found, and the guess that `laoban-admin` has
made for the template for that projects

### Command line arguments
Here are the important options
```shell
Options:
  -i,--initurl <initurl>      The url that allows the types to be decoded. Used for testing and or if you have your own set (default:
                              "@laoban@/init/allInits.json")  -t,--type <type>            the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes (default: "typescript")
  -l,--legaltypes <legal...>  the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes. Defaults to the list
                              returned by --listtypes
  -t,--type <type>            the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes (default: "typescript")
  --listTypes                 lists the types of projects that can be created (and doesn't create anything) (default: false)
```
If you maintain your own list of templates you can specific this with `--initurl`. The
environment variable `LAOBANINITURL` can also be used to specify this

If you want to reduce the list of types that will be detected you can specify `--legalyypes`.
It is doubtful that you really want to do this: mostly this is used for tests. The same is
true for `--type`: this controls the laoban.json that is generated. Note that there
is a relationship between the two. This relationship will be removed in future releases

`--listTypes` is useful when you are in doubt about the legal list of types.

## Use `laoban-admin init --dryrun`
`laoban projects` let us have a quick overview of what the `laoban-admin init` will do.
`--dryrun` creates a number of files that allow us to see what would be generated.

This is best seen from an IDE. If you start with git commited (recommended!) and
try a `laoban-admin init` then you can see the files generated in the IDE. These are
the `.laoban.test.json` and `.project.details.test.json` file. These files do nothing:
they only exist to allow you to 'try before buy'. They are particularly useful if
you have an existing `project.details.json` or `laoban.json` and want to use
`laoban-admin` to update them

### Things to look for

The `.project.details.test.json` has three major parts worth looking at

* `links` If a project uses another project also in the monorepo, then the `laoban-admin init` should detect that relationship and add any  dependent projects here
* `extraDeps` If a project uses dependencies that are not in the template t, then the `laoban-admin init` adds those dependencies here
* `extraDevDeps` If a project uses devDependencies that are not in the template t, then the `laoban-admin init` adds those devDependencies here


## Use `laoban-admin init --force` To actually generate the laoban files

This generates the real `laoban.json` and  `project.details.json`. From this point on
`laoban` should work as expected

### Things to be cautious about

Any dependencies/devDependencies that were in the original will now have the version
number specified in the template NOT the one they originally had. This is by design
(a primary goal of `laoban` is to manage these dependencies centrally)but might surprise you.

If you have a link to an older version of a project in a monorepo then this will now
have the current version. This is also by design: again we want everything to be in sync

If you want to change these
* For links: remove the link and add the project to `extraDeps` or `extraDevDeps` with the correct version
* For dependencies/devDependencies: Just add the dependency to `extraDeps` or `extraDevDeps` with the correct version

## Use `laoban update`

This will generate the `package.json` files replacing the existing ones. The
ones generated will be inline with the templates.

### Things to be aware of

Do a `git diff` on the `package.json` so that you can check for changes.
The `dependencies`, `devDependencies` and `bins` should be the same, but
scripts might need to be sorted.

## Use `laoban projects`, `laoban tsc` and `laoban test`

These work as expected: the first lists the projects. The second runs `tsc` in each project
and the third tests the projects.

