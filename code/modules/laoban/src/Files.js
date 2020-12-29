"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectDetailFiles = exports.findLaoban = exports.isProjectDirectory = exports.copyTemplateDirectory = exports.laobanFile = exports.projectDetailsFile = exports.loabanConfigName = void 0;
var fs = require("fs");
var fse = require("fs-extra");
var path = require("path");
var utils_1 = require("./utils");
exports.loabanConfigName = 'laoban.json';
exports.projectDetailsFile = 'project.details.json';
function laobanFile(dir) { return path.join(dir, exports.loabanConfigName); }
exports.laobanFile = laobanFile;
function copyTemplateDirectory(config, template, target) {
    var src = path.join(config.templateDir, template);
    var d = config.debug('update');
    return d.k(function () { return "copyTemplateDirectory directory from " + src + ", to " + target; }, function () {
        fse.copySync(src, target);
        // no idea why the fse.copy doesn't work here... it just fails silently
        return Promise.resolve();
    });
}
exports.copyTemplateDirectory = copyTemplateDirectory;
function isProjectDirectory(directory) {
    return fs.existsSync(path.join(directory, exports.projectDetailsFile));
}
exports.isProjectDirectory = isProjectDirectory;
function findLaoban(directory) {
    function find(dir) {
        var fullName = path.join(dir, exports.loabanConfigName);
        if (fs.existsSync(fullName))
            return dir;
        var parse = path.parse(dir);
        if (parse.dir === parse.root) {
            throw Error("Cannot find laoban.json. Started looking in " + directory);
        }
        return find(parse.dir);
    }
    return find(directory);
}
exports.findLaoban = findLaoban;
var ProjectDetailFiles = /** @class */ (function () {
    function ProjectDetailFiles() {
    }
    ProjectDetailFiles.workOutProjectDetails = function (hasRoot, options) {
        var p = hasRoot.debug('projects');
        var root = hasRoot.laobanDirectory;
        // p.message(() =>['p.message'])
        function find() {
            if (options.projects)
                return p.k(function () { return "options.projects= [" + options.projects + "]"; }, function () {
                    return ProjectDetailFiles.findAndLoadProjectDetailsFromChildren(root).then(function (pd) { return pd.filter(function (p) { return p.directory.match(options.projects); }); });
                });
            if (options.all)
                return p.k(function () { return "options.allProjects"; }, function () { return ProjectDetailFiles.findAndLoadProjectDetailsFromChildren(root); });
            if (options.one)
                return p.k(function () { return "optionsOneProject"; }, function () { return ProjectDetailFiles.loadProjectDetails(process.cwd()).then(function (x) { return [x]; }); });
            return ProjectDetailFiles.loadProjectDetails(process.cwd()).then(function (pd) {
                p.message(function () { return ["using default project rules. Looking in ", process.cwd(), 'pd.details', pd.projectDetails ? pd.projectDetails.name : 'No project.details.json found']; });
                return pd.projectDetails ?
                    p.k(function () { return 'Using project details from process.cwd()'; }, function () { return ProjectDetailFiles.loadProjectDetails(process.cwd()); }).then(function (x) { return [x]; }) :
                    p.k(function () { return 'Using project details under root'; }, function () { return ProjectDetailFiles.findAndLoadProjectDetailsFromChildren(root); });
            });
        }
        return find().then(function (pds) {
            p.message(function () { return __spreadArrays(['found'], pds.map(function (p) { return p.directory; })); });
            return pds;
        });
    };
    ProjectDetailFiles.findAndLoadProjectDetailsFromChildren = function (root) {
        return Promise.all(this.findProjectDirectories(root).map(this.loadProjectDetails));
    };
    ProjectDetailFiles.loadProjectDetails = function (root) {
        var rootAndFileName = path.join(root, exports.projectDetailsFile);
        return new Promise(function (resolve, reject) {
            fs.readFile(rootAndFileName, function (err, data) {
                if (err) {
                    resolve({ directory: root });
                }
                else {
                    try {
                        var projectDetails = JSON.parse(data.toString());
                        resolve({ directory: root, projectDetails: projectDetails });
                    }
                    catch (e) {
                        return reject(new Error("Cannot parse the file " + rootAndFileName + "\n" + e));
                    }
                }
            });
        });
    };
    ProjectDetailFiles.findProjectDirectories = function (root) {
        var _this = this;
        var rootAndFileName = path.join(root, exports.projectDetailsFile);
        var result = fs.existsSync(rootAndFileName) ? [root] : [];
        var children = fs.readdirSync(root).map(function (file, index) {
            if (file !== 'node_modules' && file !== '.git') {
                var curPath = path.join(root, file);
                if (fs.lstatSync(curPath).isDirectory())
                    return _this.findProjectDirectories(curPath);
            }
            return [];
        });
        return utils_1.flatten(__spreadArrays([result], children));
    };
    return ProjectDetailFiles;
}());
exports.ProjectDetailFiles = ProjectDetailFiles;
