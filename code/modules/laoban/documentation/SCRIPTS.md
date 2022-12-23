# Scripts with Laoban

The 'whole point' of `laoban` is to allow scripts to be easily created that will execute for each [project](PROJECTS.md)
.

## Getting going

### Using run

Actually you can execute a 'command' in every [project](PROJECTS.md) already. The follow will execute the command in
quotes in each project. We are using a [variable](VARIABLES.md) `${projectDirectory}` because linux and windows have different ways of finding the current
directory but the variable works anyway

```shell
laoban run 'echo "Hello ${projectDirectory}"' 
```

This is very useful. I regularly do things like the following

```shell
laoban run 'rm -rf node_modules`
laoban run 'rm -rf target`
```

### Making our first script

Let's add a new script which we will call 'helloworld' to be traditional

Open the [`laoban.json`](LAOBAN.JSON.md) file in your editor. If it has a scripts section already, just edit it,
otherwise add the following

```json
{
  "scripts": {
    "helloWorld": {
      "description": "Our first script that echos 'hello directory' in each project",
      "commands":    ["echo Hello ${projectDirectory}"]
    }
  }
}
```

You can now execute this with `laoban helloWorld`, find it in the help with `laoban --help` and it has it's own help
section with `laoban helloWorld --help`

## Types of commands

### Simple commands

```json
{
  "helloWorld": {
    "description": "Our first script that echos 'hello directory' in each project",
    "commands":    ["echo Hello ${projectDirectory}"]
  }
}
```

After adding this command `laoban --help` will now display the command and the description. and `laoban helloWorld` will
execute it

<a id='complexCommands'></a>
### More complex commands

```json
{
  "test": {
    "description": "runs ${packageManager} test",
    "commands":    [
      {"name": "test", "command": "${packageManager} test", "status": true}
    ]
  }
}
```

Here we can see that the command has one step with name `test`. Because status is true the step results will be visible
in the status. This is very useful when we have 'things we want to pass' in many projects. It's important that the 
projects all compile, that the tests execute and that they publish successfully. If we have many projects it can be
hard to 'check the logs' and see that happened. Here the command `laoban status` will tell us about the `named steps` 
and whether the last time they executed they were successful.

```typescript
export interface CommandDefn {
  name?: string,     // The name of the command
  command: string,   // the command that is actually executed
  status?: boolean,  // should the commands status be remembered
  eachLink?: boolean,// see below (hardly every used)
  osGuard?: string,  // Is the command only able to run in one operating system
  pmGuard?: string,  // Is the command only able to run with one package manager
  directory?: string // override the directory that the command is executed in
}
```

### eachLink
Some commands need to be accessed once for each link defined in the projectDetails file.

```
    "remoteLink"   : {
...
      "commands"       : [
        {"name": "remoteLink", "command": "${packageManager} link ${link}", "eachLink": true, "status": true},
```
Here we can see that the command will be executed once for each link. The variable `${link}` holds the value of the link

### directory
If a command needs to run in a different directory (typically a sub directory) the directory can be set
``` 
   "install"    : {
      "commands"   : [
        {"name": "link", "command": "${packageManager} link", "status": true, "directory": "dist"},
```             
This link command is now executed in the `dist` sub directory

## Guards

Quite often we want to conditionally execute scripts. There are three main reasons:

* we might want our script to work differently with linux/windows
* we might want a slightly different script depending on the package manage
* we might have different types of projects. For example we might have some javascript projects and some java projects.
  When we test we might want to execute a different command. (`npm test` for javascript and `mvn test` for java)

### OsGuard

Scripts can be marked so that they only run in a particularly OS. If called from the wrong os then an error is
given. `guardReason` can be set to give an error message (and document why)

```
    "pack"       : {
       ...
      "osGuard":  "Linux",
      "guardReason": "uses the linux 'cp' command",
      "commands"   : [
          ....
      ]
    },
```

### pmGuard

If a script requires a particular package manager (example `npm test` and `yarn test` are both OK but `yarn install` is
not allowed), then a pmGuard can be set. If the command is executed then it will give an error message. As
with `osGuard`, `guardReason` can be set to document why

### guard

A command can be set to only execute if a guard is defined. Unlike the `osGuard` and `pmGuard` this does not cause an
error message: only scripts that match are executed. Note that that we are using a [variable](VARIABLES.md) in the
guard. The example of ls-ports here:

```
    "ls-ports"  : {
      "description": "lists the projects that have a port defined in project.details.json",
      "guard"      : "${projectDetails.details.port}",
      "commands"   : ["js:process.cwd()"]
    },
```

Another good example is

```
    "start"     : {
      "description": "${packageManager} start for all projects that have a port defined in project.details.json",
      "guard"      : "${projectDetails.details.port}",
      "commands"   : ["${packageManager} start"],
      "env"        : {"PORT": "${projectDetails.details.port}"}
    },
```

So by setting 'ports' to a numeric value in the  `project.details.json` we have  'marked' the directory in such a way
that executing `laoban start` will start up the project. This lets us spin up multiple react projects at once. It's a
good idea if all the projects have different ports, but laoban doesn't check this

## Setting environment variables with scripts

cwd is automatically added as an environment variable to represent the current directory other environment
[variables](VARIABLES.md) can be added to scripts such as

```json
    "ls-pact":        {
"osGuard": "Windows_NT",
"description": "lists the projects with pact files in them",
"guard": "${projectDetails.details.packport}",
"commands":    ["echo %PORT%  %cwd%"],
"env": {
"PORT": "${projectDetails.details.packport}"
}
},
```

## inLinksOrder

Some scripts don't parallelise that well. For example if we are compiling projects, and some projects depend on other
projects then we want to compile them in 'the right order'.

Setting 'inLinksOrder' means that the links in the projectDetails are used to determine the order in which things are
executed

This can be seen using '-g | --generationPlan' as an option. This behavior can also be forced on any command by
selecting -l, --links






