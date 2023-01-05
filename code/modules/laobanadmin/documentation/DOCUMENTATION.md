# Setting up an existing project

For more details [read here](documentation/Existing.md). Overview:

* Open the command line, and change directory to the root of the git repo
* Use `laoban-admin projects` to see what projects are in the mono-repo
* Use `laoban-admin init --dryrun` to see what laoban files will be generated
* Use `laoban-admin init --force` To actually generate the laoban files
* Use `laoban update` to generate package.json
* Use `yarn` to make symbolic links
* Use `laoban tsc` to compile the project

# Starting with a greenfield site

For more details [read here](documentation/Greenfield.md). Overview:
* Open the command line, and change directory to the root of the git repo
* Use `laoban-admin init --dryrun` to see what laoban files will be generated
* Use `laoban-admin init --force` To actually generate the laoban files
* Edit the `laoban.json` file: it will have errors in it as it cannot 'scrape' an existing project

# What next

## Using laoban to test/compile

See [https://www.npmjs.com/package/laoban](laoban) documentation

# Making your own 'inits'
At the moment it is still extremely experimental. It works for the default inits. It needs some work to make
it more suitable for general use. The [documentation is here](documentation/Inits.md)

