# This is library for single field validation.

This is a common requirement in my applications: objects are parsed from JSON and I want
to make sure that they meet a contract

I want a list of all the error messages, and I would like it if the code reads declarative.

The `return type` of the validation is a string[] or a Promise<string[]>

## Approach
We wrap the object under test with a validate object then we can do things like the following. The validate
object accumulates issues internaly and you can call `.issues` to see those issues
```
function validateProjectDetails(v: Validate<ProjectDetails>) {
    return v.isString("name").//
        isString("description").//
        isString("template").//
        isObject("details", validateDetails)
}

function validateDetails(v: Validate<Details>) {
    return v.isBoolean("publish", 'Should the project be published').//
        isArrayofObjects('links', v => v).//
        optObject("extraDeps", v => v, 'These are added to package.json dependencies').//
        optObject("extraDevDeps", v => v, 'These are added to package.json devDependencies').//
        optObject("extraBins", v => v, 'These are added to package.json bin')
}
```
## Extra goodness
When working with CLIs I often want to validate that directories and files exist.


```
function validateTemplateDirectory(context: string, c: Config, templateDir: string): Promise<string[]> {
    let dir = path.join(c.templateDir, templateDir);
    return Validate.validateDirectoryExists(context, dir).then(dirErrors => dirErrors.length === 0 ?
        Validate.validateFile(`package.json in template directory ${templateDir}`, path.join(dir, 'package.json'), validatePackageJson) :
        dirErrors)
}```
