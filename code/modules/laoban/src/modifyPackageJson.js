"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.modifyPackageJson = exports.saveProjectJsonFile = exports.loadVersionFile = exports.loadPackageJsonInTemplateDirectory = void 0;
var path = require("path");
var fs = require("fs");
function loadPackageJsonInTemplateDirectory(config, projectDetails) {
    var file = path.join(config.templateDir, projectDetails.template, 'package.json');
    try {
        var data = fs.readFileSync(file); // not sure why readFile async not working: silent fail
        return Promise.resolve(JSON.parse(data.toString()));
    }
    catch (err) {
        return Promise.reject(Error("Could not find template file" + file + '\n' + err));
    }
}
exports.loadPackageJsonInTemplateDirectory = loadPackageJsonInTemplateDirectory;
//
// return new Promise<any>((resolve, reject) => fs.readFile(file, (err, data) => {
//     debug.debug('update', () => '              have read ' + file + '\n' + err)
//     if (err) reject(err)
//     if (data == undefined) {return reject(Error("Could not find template file" + file))}
//     resolve(JSON.parse(data.toString()))
// }))
// }
function loadVersionFile(config) {
    var file = config.versionFile;
    try {
        return Promise.resolve(fs.readFileSync(file).toString());
    }
    catch (err) {
        return Promise.reject(Error("Could not find version file" + file + "\n" + err));
    }
}
exports.loadVersionFile = loadVersionFile;
//
//     return new Promise<any>((resolve, reject) => fs.readFile(file, (err, data) => {
//         if (err) reject(err)
//         if (data) resolve(data.toString())
//     }))
// }
function saveProjectJsonFile(directory, packageJson) {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(packageJson, null, 2) + "\n");
    return Promise.resolve();
}
exports.saveProjectJsonFile = saveProjectJsonFile;
function modifyPackageJson(raw, version, projectDetails) {
    var result = __assign({}, raw);
    Object.assign(result, projectDetails);
    add(result, 'dependencies', projectDetails.details.extraDeps);
    var links = projectDetails.details.links ? projectDetails.details.links : [];
    links.map(function (l) { return result['dependencies'][l] = version; });
    add(result, 'devDependencies', projectDetails.details.extraDevDeps);
    add(result, 'bin', projectDetails.details.extraBins);
    delete result.projectDetails;
    result.version = version;
    result.name = projectDetails.name;
    result.description = projectDetails.description;
    return result;
}
exports.modifyPackageJson = modifyPackageJson;
function add(a, name, b) {
    if (b) {
        var existing = a[name];
        var cleanExisting = existing ? existing : {};
        var cleanB = b ? b : {};
        var result = __assign(__assign({}, cleanExisting), cleanB);
        if (Object.keys(result).length === 0)
            delete a['name'];
        else
            a[name] = result;
    }
}
