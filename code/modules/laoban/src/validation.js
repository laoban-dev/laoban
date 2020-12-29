"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProjectDetailsAndTemplates = exports.validateLaobanJson = void 0;
var path = require("path");
var utils_1 = require("./utils");
// @ts-ignore
var validation_1 = require("@phil-rice/validation");
function validateLaobanJson(v) {
    return v.isString('templateDir', 'The template directory is where the templates that are used in project.details.json are used'). //
        isString('versionFile', "The versionFile is the location of the 'project version number', used during update"). //
        isString('log', "This is used to say what the name of the log file in the project directory. It is typically '.log'. The output from commands is written here"). //
        isString('status', "This is used to record the success or failure of commands (such as 'test')"). //
        isString('profile', 'This is used to record how long things took to run'). //
        isString('packageManager', 'Typically npm or yarn'). //1
        isObjectofObjects('scripts', validateScriptDefn);
}
exports.validateLaobanJson = validateLaobanJson;
function validateScriptDefn(v) {
    return v.isString('description'). //
        isArrayofObjects('commands', validateCommand);
}
function validateCommand(v) {
    if (typeof v.t === 'string')
        return v;
    var vdefn = v;
    return vdefn.isString('command');
}
function validateProjectDetailsAndTemplates(c, pds) {
    var nameAndDirectories = pds.map(function (pd) { return ({ name: pd.projectDetails.name, directory: pd.directory }); });
    var grouped = utils_1.groupBy(nameAndDirectories, function (nd) { return nd.name; });
    var duplicateErrors = utils_1.flatten(Object.keys(grouped).map(function (key) {
        return grouped[key].length > 1 ? __spreadArrays(["Have multiple projects with same mame"], grouped[key].map(function (g) { return g.name + " " + g.directory; })) :
            [];
    }));
    if (duplicateErrors.length > 0)
        return Promise.resolve(duplicateErrors);
    var pdsIssues = utils_1.flatten(pds.map(function (pd) { return validateProjectDetails(validation_1.Validate.validate("Project details in " + pd.directory, pd.projectDetails)).errors; }));
    return pdsIssues.length > 0 ?
        Promise.resolve(pdsIssues) :
        Promise.all(utils_1.removeDuplicates(pds.map(function (d) { return d.projectDetails.template; })).sort().map(function (template) {
            return validateTemplateDirectory("Template Directory", c, template);
        })).then(utils_1.flatten);
}
exports.validateProjectDetailsAndTemplates = validateProjectDetailsAndTemplates;
function validateTemplateDirectory(context, c, templateDir) {
    var dir = path.join(c.templateDir, templateDir);
    return validation_1.Validate.validateDirectoryExists(context, dir).then(function (dirErrors) { return dirErrors.length === 0 ?
        validation_1.Validate.validateFile("package.json in template directory " + templateDir, path.join(dir, 'package.json'), validatePackageJson) :
        dirErrors; });
}
function validateProjectDetails(v) {
    return v.isString("name"). //
        isString("description"). //
        isString("template"). //
        isObject("details", validateDetails);
}
function validateDetails(v) {
    return v.isBoolean("publish", 'Should the project be published'). //
        // isArrayofObjects('links', v => v).//
        optObject("extraDeps", function (v) { return v; }, 'These are added to package.json dependencies'). //
        optObject("extraDevDeps", function (v) { return v; }, 'These are added to package.json devDependencies'). //
        optObject("extraBins", function (v) { return v; }, 'These are added to package.json bin');
}
function validatePackageJson(v) {
    return v.isObject('dependencies', function (v) { return v; });
}
