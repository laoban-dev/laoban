# Laoban Cheatsheet

| Command | Guarded? | Purpose |
| --- | --- | --- |
| `laoban update` | No |Used when the version number in `version.txt` has been changed to update the project, and is also used when a project.details.json file is changed 
| `laoban tsc -asl` | details.tsc | Compile all the typescript projects in the correct order 
| `laoban test -asl` | details.test | Test all the typescript projects in the correct order
| `laoban publish -asl` | details.publish | Publishes the projects to npm
| `laoban status -a` | No |  Show the status of important commands (compile/test) across all projects
| `laoban run 'rm -rf node_modules'` | No | In linux remove all the node modules from the project (be careful)



