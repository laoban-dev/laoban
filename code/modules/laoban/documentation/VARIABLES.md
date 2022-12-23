# Variables

Our scripts need to be 'customized'. For example we might want to include the name of the project 
in a script. 

## How do I find out what variables exist

A good way is to execute a script in a single directory and add `-v` to the end

```typescript
   cd modules/project
   laoban helloWorld -v
```

On my windows machine this gives the following

```json
{
  "laobanDirectory": "C:\\git\\laoban\\code",
  "laobanConfig": "C:\\git\\laoban\\code\\laoban.json",
  "templateDir": "C:\\git\\laoban\\code/template",
  "versionFile": "C:\\git\\laoban\\code/template/version.txt",
  "log": ".log",
  "status": ".status",
  "profile": ".profile",
  "packageManager": "yarn",
  "sessionDir": "C:\\git\\laoban\\code\\.session",
  "throttle": 0,
  "os": "Windows_NT",
  "projectDirectory": "C:\\git\\laoban\\code\\modules\\variables",
  "projectDetails": {
    "template": "typescript",
    "name": "@phil-rice/variables",
    "description": "A library that can dereference ${xxx} in strings",
    "details": {
      "publish": true
    }
  }
}
```
Legal variables from this include
```typescript
 ${projectDirectory}
 ${projectDetails.description}
 ${projectDetails.details.publish}
```

If you want to see what the variables are in each project you can try `laoban <scriptname> -asv` 
which will fill the screen with details...

## How do I use variables

### In the run command
```shell
laoban run 'echo "Hello ${projectDirectory}"' 
laoban run 'echo "Hello ${projectDetails.name} ${projectDetails.description}"' 
```

### In the `laoban.json` `scripts` section 
An example script showing most uses is here:
```json
    {"start"     : {
      "description": "${packageManager} start for all projects that have a port defined in project.details.json",
      "guard"      : "${projectDetails.details.port}",
      "commands"   : ["${packageManager} start"],
      "env"        : {"PORT": "${projectDetails.details.port}"}
    }}
```

## Debugging variables
My approach is usually
* change the directory to a project directory that is giving me a project
* execute the laoban with `-v` added to the end

Example
```shell
cd template
laoban helloWorld -v
```

The output is
```shell
Raw command is [echo Hello ${projectDirectory}] became [echo Hello C:\git\laoban\code\modules\variables]
legal variables are
{
  "laobanDirectory": "C:\\git\\laoban\\code",
  "laobanConfig": "C:\\git\\laoban\\code\\laoban.json",
  "templateDir": "C:\\git\\laoban\\code/template",
  ...(lines removed)...
```

