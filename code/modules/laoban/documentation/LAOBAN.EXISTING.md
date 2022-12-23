# Using Laoban

If you are new to a project that is managed by laoban then this is a short guide to getting start.

## Get your code for the project

In a git project this would be just `git clone xxx`

## Find the `laoban.json` file

Very often this is in the root directory. This is the 'base' directory of the project and when working with `laoban` you
must be 'in' or 'under' this project.

## Open a command line terminal

Either by windows with the 'cmd' or 'powershell' tools, or from your favourite IDE.

## Install Laoban

Details can be found [here](INSTALLING.LAOBAN.md)

## See how many projects you have

See [here](PROJECTS.md/#projects) for more details

```shell
laoban projects
```

## Get all your dependancies

* If you are using yarn (recommended) just type `yarn` at the command line
* If you are using npm (not recommend with a mono repo) then `laoban npm_install`

Note that to have access to `laoban npm_install` your `laoban.json` should include:
```json
 {
  "parents": [
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/npm.laoban.json"
  ]
}
```

## Compile your code

```shell
laoban tsc -asl
```
This executes the `tsc` command (typescript compile) in each project.

## Test your code

```shell
laoban test -asl
```

## Find the status of the projects

If you have many projects it might be difficult to determine from just looking at the output whether the project has
successfully compiled or executed it's tests. That's where `laoban status` helps us

```shell
laoban status
``` 

In the case of the `laoban` project itself it might give

```text
                                             test  tsc
C:\git\laoban\code\modules\debug             true  true
C:\git\laoban\code\modules\files             true  true
C:\git\laoban\code\modules\generations       true  true
C:\git\laoban\code\modules\laoban            true  true
C:\git\laoban\code\modules\utils             true  true
C:\git\laoban\code\modules\validation        true  true
C:\git\laoban\code\modules\variables         true  true
```

## Working with libaries

It is very common in `laoban` projects for some code to be in a library and the the using code be in a different
project. Let's call these projects `main` and `library`.

We often change the code in the two places simultaneously. For example we need to change code in `library` and we use it
in `main`. Before executing a test or code in `main`
we probably need to compile the `library`. This can be done by

```text
laoban tsc -p library
laoban test -p main
```