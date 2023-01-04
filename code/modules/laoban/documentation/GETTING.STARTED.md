# Getting started

After you have [installed](INSTALLING.LAOBAN.md) `laoban` you will need to 
* Set up a `laoban.json`
* add a `project.details.json` file to each subproject
  * Edit for name/description/template and links 
* Create a templates directory 
  * Add a template for each type of project.

# The easy way

Install and use [`laoban-admin`](https://www.npmjs.com/package/@laoban/admin)

# The 'do it yourself way'

## Setting up `laoban.json`
Details of this file can be found [here](LAOBAN.JSON.md). If you are working with typescript and using yarn
a reasonable start is 

```json
{
  "packageManager": "yarn",
  "parents":        [
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/core.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.publish.laoban.json"
  ]}
```

