# Installing

* `npm i -g @laoban/admin@latest` is the recommended installation
* `npm i -g laoban@latest` will install `laoban` without `laoban-admin` 

# Laoban Cheatsheet

| Command | Guarded? | Purpose |
| --- | --- | --- |
| `laoban update` | No |Used when the version number in `version.txt` has been changed to update the project, and is also used when a project.details.json file is changed 
| `laoban tsc -asl` | details.tsc | Compile all the typescript projects in the correct order 
| `laoban test -asl` | details.test | Test all the typescript projects in the correct order
| `laoban publish -asl` | details.publish | Publishes the projects to npm
| `laoban status -a` | No |  Show the status of important commands (compile/test) across all projects
| `laoban run 'rm -rf node_modules'` | No | In linux remove all the node modules from the project (be careful)

# Laoban-admin Cheatsheet
[aoban-admin](https://www.npmjs.com/package/@laoban/admin) is the recommended way to [getting started](GETTING.STARTED.md)
with existing projects

| Command |  Purpose |
| ---  --- |
| `laoban-admin projects` | Lists the found projects in the monorepo (with package.json files) and what is the recommended template
| `laoban-admin init --dryrun` |  Generates 'test' files that allow you to look at them before using them
| `laoban-admin init --force` |  Sets up your project with `laoban.json` and `project.details.json` that should work





