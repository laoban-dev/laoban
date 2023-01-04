# laoban-admin

The tool laoban is used to manage projects in mono-repos.

In order to make the experience of 'setting up the projects' easier, 
laoban-admin has been created. In most projects this will only
be used once, to set up the project. 

Laoban is used constantly: some users might use it a hundred times a day.
It is optimised for this type of usage pattern. Laoban-admin is not: it is
only used very rarely. Thus it is expected that the users are
not very familiar with it.

# Setting up an existing project

Overview:
* Open the command line, and change directory to the root of the git repo
* Use `laoban-admin projects` to see what projects are in the mono-repo
* Use `laoban-admin init` to set up a project
* Use `laoban-admin init --dryrun` to see what laoban files will be generated 
* Use `laoban-admin init --force` To actually generate the laoban files
* Use `laoban tsc` to compile the project

## Existing project in mono-repo


# Starting with a greenfield site

