# Laoban

Laoban or 老板 is chinese for 'boss'. It is a tool for controlling multiple projects. While it is language agnostic it
probably offers the most value to javascript/typescript projects in a monorepo.


## Getting started with a laoban managed project
* If you want to install it `npm i -g laoban@latest`
* If you are new to a project that is managed by `laoban` then start [here](LAOBAN.EXISTING.md)
* If you want to try out `laoban` on your project start [here](GETTING.STARTED.md)

# Further documentation

* [Cheat Sheet](documentation/CHEATSHEET.md)
* [Laoban and Yarn](documentation/YARN.md)
* [laoban.json](documentation/LAOBAN.JSON.md)
* [Logs](documentation/LOGS.md)
* [Projects](documentation/PROJECTS.md)
* [Scripts](documentation/SCRIPTS.md)
* [Templates](documentation/TEMPLATES.md)
* [Variables](documentation/VARIABLES.md)
* [Command line arguments](documentation/COMMAND.LINE.ARGUMENTS.md)


## Motivation

`npm` does not handle multiple projects well. Each project is a separate project.json that is managed separately. There
is no ability to 'inherit' or share configuration, so in a project with many moving parts each of which is implemented
with a small bit of javascript/typescript, it can be difficult to keep all the dependancies in line.

Laoban makes the following easy:

* Managing config files
    * There are a number of template files (might be just one)
        * These holds files that are copied to the project whenever 'laoban update' is called
        * The package.json in it is 'modified' during the copying based on a file called 'project.details.json' in the
          project
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

Laoban is not opinionated. Replacing `npm` with `yarn`  in the config will let you use all the features with yarn. If
you want to use it with maven or sbt or... it works fine (although those tools already have much of the capabliities
that laoban brings to the javascript world)

# What are the 'golden moments'

* Running all the tests in parallel across multiple projects
    * Without this I have to either use a pipeline after a commit, or make a script to call them one at a time
* Seeing the status of the important commands
    * When working with ten or more projects I found it very hard to get a simple of view of how well the code was
      behaving in each project
* Updating all the 'react' project settings in one go
    * You can update the template settings, call `laoban update` followed by `laoban install` and `laoban status`
    * Now you know how all the projects have responded to the upgrade: they are all using it, and they have been
      compiled and tested
* Updating a global version number
    * If the projects are tightly coupled, I like them to share a version number.
* When the commands take a long time you can see the tail of the logs of the commands easily
    * Press ? while the commands are running for a menu

# Typical usage

## When loading a project with many subprojects from git

* git clone the project
* `laoban tsc -asl`will compile the sub projects in the correct order
* `laoban test` will test the sub projects
* `laoban status` will let you see which projects compiled and passed all their tests

## When publishing

* Change the version in the template directory
* `laoban update` will update all the projects to the new version number
* `laoban publish` will publish all the projects
