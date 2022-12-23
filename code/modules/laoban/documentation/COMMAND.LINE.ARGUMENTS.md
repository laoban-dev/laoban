# Command line arguments

Typing `laoban` or `laoban --help` will display a list of the commands that can be executed, and information about options.

In order to find about the arguments that can be used with a specific script type `laoban <scriptName> --help`

## Command line arguments without a script given

* `--version` displays the version number
* `--help` displays a help summary. 
* `--load.laoban.debug` Use this when laoban doesn't run properly.

The last option is used when you've changed `laoban.json` or are using something in the parents and they 'don't work'. 
The debug gives information about what is being loaded, and where from. It's not perfect, but might help.

## Common command line arguments for scripts

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

This allows a bit of debugging of scripts. If you are having problems adding -s gives a little more information about
what is happening

This is a great option when you want 'information from many places'. Like

* laoban run 'ls *.config' -as

### option `-d`

This is a dryrun. Instead of executing the command, it is just printed. This includes dereferencing the variables. A
combination of `-ds` gives quite nice information about what is executing

### option `-v`

Only used when debugging to help work out what are legal [variables](VARIABLES.md)

### option `-g`

Rather like '-a' in that it does not display any commands. Instead it outputs the 'generation plan': the directories
that will be processed in parallel. This is descriped [here](PROJECTS.md)

### option `-t xxx`

Sets the maximum number of items executed at once, so that the computer doesn't get over loaded. This overrides the
setting in laoban.json. Use this when using a weak computer (actually it's usually better to set it in `laoban.json`)
