# Laoban

Laoban or 老板 is chinese for 'boss'. It is a tool for controlling multiple projects. While it is language agnostic it
probably offers the most value to javascript/typescript projects

## NPM usage

NPM does not handle multiple projects well. Each project is a separate project.json that is managed separately. There is
no ability to 'inherit' or share configuration, so in a project with many moving parts each of which is implemented with
a small bit of javascript/typescript, it can be difficult to keep all the dependancies in line.

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

For more details read [the full README](code/modules/laoban/README.md)

# Installation instructions

The simplest way is to use npm:
```
npm i -g -D laoban
```
On linux you may need to execute this with `sudo` if you get a permissions error

Testing it works
```
laoban
```
If there is no laoban.json in the current or the parent directories, it will give an error




# Contributing
Please feel free to use and help laoban better. If you want to load the code locally the following may help


## Linux users (or Windows subsystem for Linux users)
Please git clone the repo, then execute the scripts 'install.sh' in the root directory

Note that if you have laoban installed in your global package then changes you make will not be visible. I recommend
making a symbolic link. In the code directory or below you can type the following

```
sudo ln -s $(yarn bin)/laoban /usr/bin/laoban"
```
If you want to have a devban allowing both laoban and devban at the same time:
```
sudo ln -s $(yarn bin)/laoban /usr/bin/devban"
```

