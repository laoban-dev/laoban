# Logs

When a script is executed in `laoban` it can be executed in a lot of places at one. Some 
of the projects it is used on have 20 or more sub projects. 

It is desirable to be able to see 'what happened when I executed the command in this project'. Of 
course you can use the `-p` option to only execute in one or a few projects, but 
the logs are very useful for this.

## Logs in the project directory
The default location for the logs is `.log` in the project directory (but this gets cluttered very quickly),

## Logs in .sessions

When a script is run a new directory is added to `.sessions` which includes the name of the script
the arguments and the time. 

In this directory is added a line for each project that the command is executed in. This is
the contents of the output stream from that command

