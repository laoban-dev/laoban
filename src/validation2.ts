import {CommandDefn, Config, Details, PackageJson, ProjectDetails, ProjectDetailsAndDirectory, RawConfig, ScriptDefn} from "./config";
import * as path from "path";
import {flatten, groupBy, removeDuplicates} from "./utils";
import {Validate} from "./val";


export function validateLaobanJson(v: Validate<RawConfig>): Validate<RawConfig> {
    return v.isString('templateDir').//
        isString('versionFile').//
        isString('log').//
        isString('status').//
        isString('profile').//
        isString('packageManager').//
        isObjectofObjects<ScriptDefn>('scripts', validateScriptDefn)
}

function validateScriptDefn(v: Validate<ScriptDefn>) {
    return v.isString('description').//
        isArrayofObjects('commands', validateCommand)
}

function validateCommand(v: Validate<CommandDefn | string>) {
    if (typeof v.t === 'string') return v;
    let vdefn: Validate<CommandDefn> = <any>v
    return vdefn.isString('command')
}


export function validateProjectDetailsAndTemplates(c: Config, pds: ProjectDetailsAndDirectory[]): Promise<string[]> {
    let nameAndDirectories = pds.map(pd => ({name: pd.projectDetails.name, directory: pd.directory}))
    let grouped = groupBy(nameAndDirectories, nd => nd.name)
    let duplicateErrors = flatten(Object.keys(grouped).map(key =>
        grouped[key].length > 1 ?
            [`Have multiple projects with same mame`, ...grouped[key].map(g => `${g.name} ${g.directory}`)] :
            []))
    if (duplicateErrors.length > 0) return Promise.resolve(duplicateErrors)
    let pdsIssues = flatten(pds.map(pd => validateProjectDetails(Validate.validate(`Project details in ${pd.directory}`, pd.projectDetails)).errors))
    return pdsIssues.length > 0 ?
        Promise.resolve(pdsIssues) :
        Promise.all(removeDuplicates(pds.map(d => d.projectDetails.template)).sort().map(template =>
            validateTemplateDirectory(`Template Directory`, c, template))).then(flatten);
}

function validateTemplateDirectory(context: string, c: Config, templateDir: string): Promise<string[]> {
    let dir = path.join(c.templateDir, templateDir);
    return Validate.validateDirectoryExists(context, dir).then(dirErrors => dirErrors.length === 0 ?
        Validate.validateFile(`package.json in template directory ${templateDir}`, path.join(dir, 'package.json'), validatePackageJson) :
        dirErrors)
}

function validateProjectDetails(v: Validate<ProjectDetails>) {
    return v.isString("name").//
        isString("description").//
        isString("template").//
        isObject("details", validateDetails)
}

function validateDetails(v: Validate<Details>) {
    return v.isBoolean("publish").//
        isArrayofObjects('links', v => v).//
        optObject("extraDeps", v => v).//
        optObject("extraDevDeps", v => v).//
        optObject("extraBins", v => v)
}
function validatePackageJson(v: Validate<PackageJson>) {
    return v.isObject('dependencies', v => v)
}
