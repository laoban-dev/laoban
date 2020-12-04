# Laoban

Laoban or 老板 is chinese for 'boss'. It is a tool for controlling multiple projects. While it is
language agnostic it probably offers the most value to javascript/typescript projects

## NPM usage
NPM does not handle multiple projects well. Each project is a separate project.json that is managed separately. 
There is no ability to 'inherit' or share configuration, so in a project with many moving parts each of which
is implemented with a small bit of javascript/typescript, it can be difficult to keep all the dependancies in line.

Laoban makes the following easy:
* Managing config files
    * There are a number of template files (might be just one)
        * These holds files that are copied to the project whenever 'laoban update' is called
        * The package.json in it is 'modified' during the copying based on a file called 'project.details.json' in the project 
        * In my projects these files are things like:
             * jest.config.json
             * babel.config.json
             * tsconfig.json
             * the jest adapter for the version of jest
* Executing things in parallel across all projects
     * `tsc`: to compile all the typescript
     * `npm test`: to run all the tests
     * `npm install`: to make sure everything is loaded
     * `npm `  
     * Any command at all...
* It keeps track of the status of important things: such as last test execution, last compile, last install

## Other package managers
Laoban is not opinionated. Replaceing `npm` with `yarn`  in the config will let you use all the features with yarn.
If you want to use it with maven or sbt or... it works fine (although those tools already have much of the capabliities that laoban brings to the javascript world)


# What are the 'golden moments'
* Running all the tests in parallel across multiple projects
     * Without this I have to either use a pipeline after a commit, or make a script to call them one at a time
* Seeing the status of the important commands
     * When working with ten or more projects I found it very hard to get a simple of view of how well the code was behaving in each project
* Updating all the 'react' project settings in one go
     * You can update the template settings, call `laoban update` followed by `laoban install` and `laoban status`
     * Now you know how all the projects have responded to the upgrade: they are all using it, and they have been compiled and tested
* Updating a global version number
     * If the projects are tightly coupled, I like them to share a version number.


# Typical usage

## When loading a project with many subprojects from git 
* git clone the project
* laoban install will setup and test the subprojects in parallel

## When publishing
* Change the version in the template directory
* `laoban update` will update all the projects
* `laoban publish` will publish all the projects


# Important ideas

## laoban.json
This is a file that configures laoban. The variable values can be seen by `laoban config`

The existance of the file marks that this is the root of a 'big project' which is composed of one or more sub projects

It holds:
* "templateDir": the directory that the templates can be found in
* "log": the name of the log file found in the project directories holding the log of executing the commands
* "status": the name of the file (in each project directory) that holds the status of 'important commands' executed
* "scriptDir": A place for bash scripts that can be accessed by the laoban commands. You can put your own scripts here
* "packageManager": defaults to npm

## Templates
* under `templateDir`. Each template is a directory holding files that are used by the update command

## variables
The syntax ${variableName} allows access to variables. These can be used
*  In other variables 
*  In commands

Legal variables are the variables in laoban.json and the variables in the project.details.json. Examples are

* `laoban run 'echo ${projectDetail.template}' -a`. Note the use of '' which is used to prevent bash from attemption to dereference the variables
* `laoban run 'echo ${scriptDir}'`

When debugging executing `laoban <scriptname> -adsv` can provide a lot of help. This will show the value of the command being executed in each direcoty, and
if the variable is not 'correct' you can often see what are legal values, and why it's not working

## project.details.json
```
{
  "template"      : "noreact",
  "name"          : "@phil-rice/lens",
  "description"   : "A simple implementation of lens using type script",
  "projectDetails": {
    "generation"  : 0,
    "publish"     : true,
    "links"       : [],
    "extraDeps"   : {},
    "extraDevDeps": {}
  }
}
```
If this is present in a directory it tells laoban that the directory is a project directory.
* `template` is the name of the subdirectory that holds the configuration files that laoban will place in the project
* `name` is the name of the project. This is injected into package.json by update
* `description` is the name of the project. This is injected into package.json by update
* `extraDeps` are the names of dependancies that this project needs and are to be added to the template 
* `extraDevDeps` are the names of developer dependancies that this project needs and are to be added to the template 
* `links` are used within the 'master project' that laoban is looking after. 
      * It allows laoban to set up symbolic links so that changes in one project are immediately reflected
      * These are added as dependencies to the project, with the 'current version number'
* `publish` should this project be affected by commands with the guard condition ${projectDetails.projectDetails.publish}
      * Typically these are projects to be published to npmjs
      * typicall commands are `laoban pack`, `laoban publish`, `laoban ls-publish`
* `generation` the projects are sorted in generation order so that all generation 0 projects are processed before generation 1
      * See the 'TODO' section at the end: generations are only respected in display order at the moment

## Commands

These are added to laoban by means of the laoban.json file. An inspection of it should give you a good idea
of how to add your own command. Each command can have multiple sections or steps. Each step is executed in it's own shell
so for example changing directory or setting environment variables in one step will not impact others

### Simple commands
```
    "log"       : {"description": "displays the log file", "commands": ["cat ${log}"]},
```
After adding this command `laoban --help` will now display the command and the description. The command simply 
executes `cat ${log}`.

### Commands with step names and (optional) status

```
"test"      : {
"description": "runs ${packageManager} test",
"commands"   : [{"name": "test", "command": "${packageManager} test", "status": true}]
},
```
Here we can see that the command has one step with name `test`. Because status is true the 
step results will be visible in the status

## More Command features

### Javascript
If the text of a command starts with js: then the command will be executed in javascript. 

Examples
* js:process.cwd()
* js:"Hello World"

This is primarily for `js:process.cwd()` so that we can run scripts on both windows and linux that want to show the current directory

### OsGuard

Commands can be marked so that they only run in a particularly OS. Examples can be seen in the laoban.json

```
    "pack"       : {
       ...
      "osGuard":  "Linux",
      "commands"   : [
          ....
      ]
    },
```

## pmGuard
If a command requires a particular package manager (example `npm test` and `yarn test` are both OK but `yarn install` is not allowed),
then a pmGuard can be set. 


## options

### option `-a`
The -a means 'in all projects'. Without this laoban looks at the current directory
* If it contains a project.details.json, the command is executed in this directory only
* If it doesn't contain a project.details.json the command is executed as though -a had been specified  


### options `-p <project>`
You can give a regex for the project name and the command will be executed in those projects

Example
* You are in a project X that depends on another project Y
* you type laoban tsc -p X 
    * Now the tsc is executed in project X

### option `-s`
This allows a bit of debugging of scripts. If you are having problems adding -s gives a little more information about what is happening

This is a great option when you want 'information from many places'. Like 
* laoban run 'ls *.config' -as

### option `-d`
This is a dryrun. Instead of executing the command, it is just printed. This includes dereferencing the variables. 
A combination of `-ds` gives quite nice information about what is executing

### option `-v`
Only used when debugging to help work out what are legal variables


## status
The idea of `status` is to give a way to visualise what is happening across all the sub projects
* Some commands are marked as 'status: true'
* When these are executed they are recorded in the status file for that project
* `laoban status` will display the latest status
* `laoban compactStatus` will crunch the status down

# TODO

## Validation on laoban.json

## Validation on project.details.json

## Autocalculate generation from links
Because we have links between projects we can calculate this and display them

## Allow some commands to obey generations 
by means of waiting until all earlier generation commands have finished. Usually this isn't needed, so 
the commands should be flagged

## Improve the 'shelling out'. 
Currently we shell out and wait for it to finish. It would be better to use spawn and be able to 
process the logs as the commands execute. This will reduce memory load and give a better experience

## Need a plugin story so that we don't have to shell out for common things
* For example updating package json... only important for npm/yarn. Currently done by a script
* We want to be able to use other people's scripts easily

