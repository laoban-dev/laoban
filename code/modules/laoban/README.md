# Laoban

It is a tool for controlling multiple projects (called packages in `laoban`-speak). While it is fairly language agnostic it
probably offers the most value to javascript/typescript projects in a __monorepo__.


* [Documentation](https://laoban.dev/)
* Installation `npm i -g laoban`

# Capabilities

If you have tried to use `lerna` or `yarn workspaces` and found them lacking then this might be for you.

## Trivial to make scripts that run across packages
* Easy to have scripts execute in multiple packages simultaneously
* Scripts execute in the 'right order' if there are dependencies between packages. (for example compilation needs the dependencies to be compiled first)
* With 'guards' as some scripts aren't suitable for all packages
* Maintains a 'status' across all packages, so that you can see which packages have not compiled, tested or published successfully
* Excellent logging of the scripts (you can easily find the log for 'this command' executed at 'this time' in 'this package')

## Easy publishing of packages
* Easy to update version numbers across packages
* Easy to publish all packages in a single command

## Manage 'common' package structures (aka templates)

* If many of your packages use a dependency and you want to update that dependency you can do it in one place
* If you have configuration files like jest.config, tsconfig.json, tslint.json, etc. you can manage them in one place
* Easy to make your own 'templates'
* Templates extend other templates, so you can have a 'base' template and then extend it with 'just the differences'

## Manage common scripts

* Different package types need different groups of scripts.
  * For example some packages need to be compiled, others don't.
  * Some packages need gui testing, others don't.
  * Some packages are java based and use maven, others are typescript based and need yarn or npm commands
* We want to be able to manage these scripts centrally as an organisation, but allow individual packages to override them
 
# When is it suitable (or not) to use laoban

* If you are a single developer with a single small javascript/typescript project there is no value in using laoban
* If you are working on a project and maintaining libraries, or have split the project into multiple packages then laoban can help you manage them
* If you are developing a large project that is big and ungainly, and you would like to split it up, but 'it's too hard' then 
laoban is ideal to help you
* If you are a member of a company with standards (such as 'which version of node', 'which version of react') 
then laoban is ideal to help you manage those standards

# Getting starting 

* If you are new to a package that is managed by `laoban` then start [here](https://laoban.dev/laoban/LAOBAN.EXISTING.html)
* If you want to try out `laoban` on your package start [here](https://laoban.dev/laoban/GETTING.STARTED.html)

# Motivation

`npm` does not handle multiple packages well. Each package is a separate package.json that is managed separately. There
is no ability to 'inherit' or share configuration, so in a package with many moving parts each of which is implemented
with a small bit of javascript/typescript, it can be difficult to keep all the dependencies in line.

In the past I have found myself making a whole raft of scripts, and then forgetting them. Copying them
for use in other packages was problematic and prone to error. Most of the logic in the 
script was the same, and can be generalised across multiple packages. Laoban was the result of 
refactoring these scripts and making them more declarative.

## Other package managers

Laoban is not very opinionated about which one to use. Replacing `npm` with `yarn`  in the config will let you use all the features with yarn. If
you want to use it with maven or sbt or... it works fine (although those other language tools already have much of the capabilities
that laoban brings to the javascript world). By 'not very opinionated' we mean 
*'you should be using yarn workspaces in a monorepo world, but if you don't want to you can use npm... but your 
life will be much harder'*

# What are the 'golden moments'

* Running all the tests in parallel across multiple packages
    * Without this I have to either use a pipeline after a commit, or make a script to call them one at a time
* Seeing the status of the important commands
    * Which packages have not compiled, or tested, or published successfully?
      * And then go and look at only the 'important' log and find why
    * When working with ten or more packages I found it very hard to get a simple of view of how well the code was
      behaving in each package
* Updating all the 'react' package settings in one go
    * You can update the template settings, then call `laoban update` 
    * You can compile the changes in one command `laoban compile`
    * You can test the changes in one command `laoban test`
    * And now you can get a status of all the packages, knowing which have been impacted negatively with `laoban status`
* Updating a global version number
    * If the packages are tightly coupled, I like them to share a version number.

# Typical usage

## When loading a project with many  packages from git

* git clone the project
* `laoban compile -asl`will compile the packages in the correct order
* `laoban test` will test the packages
* `laoban status` will let you see which packages compiled and passed all their tests

## When publishing

* `laoban update --minor` will update all the packages to the new minor version number (or you can use `--major` or `--setVersion xxx`)
* `laoban publish` will publish all the packages

# Why the name `laoban`

I tried every 'boss' or 'controller' work I could think of! Laoban or 老板 is chinese for 'boss' and wasn't taken
on npmjs (although it was on github) 
