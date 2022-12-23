# laoban.json

This is a file that configures laoban. The variable values can be seen by `laoban config`

The existence of the file marks that this is the root of a 'big project' which is composed of one or more sub projects


## Further documentation

* [Projects](PROJECTS.md)
* [Templates](TEMPLATES.md)
* [Scripts](SCRIPTS.md)

## Parents

It is rare to just have 'a single laoban.json'. That would probably violate the principle of 'separation of concerns'.

Instead we have the ability to 'merge together' lots of parents. A typical
`laoban.json` file might look like this:


```json
{
  "parents":        [
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/core.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.publish.laoban.json"
  ]
}
```
* The `core` parent pulls in useful things that are language dependant
* The `typescript` parent pulls in scripts for compiling and testing typescript
* The `typescript.publish` parent pulls in scripts for publishing to `npmjs`

## Important values in laoban,json
All of these have defaults if you include the `core` in parents.

* `templateDir`: the directory that the templates can be found in
* `log`: the name of the log file found in the project directories holding the log of executing the commands
* `status`: the name of the file (in each project directory) that holds the status of 'important commands' executed
* `scriptDir`: A place for bash scripts that can be accessed by the laoban commands. You can put your own scripts here
* `packageManager`: Probably `npm` or `yarn`
* `throttle` sets the maximum number of parallel activities that will be executed. The default is 0 which doesn't limit
  things

