"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prettyPrintGenerations = exports.calcAllGenerationRecurse = exports.splitGenerationsByLinks = exports.calculateAllGenerations = void 0;
var utils_1 = require("./utils");
function calculateAllGenerations(scds) {
    return calcAllGenerationRecurse(scds, { existing: [], generations: [] });
}
exports.calculateAllGenerations = calculateAllGenerations;
function splitGenerationsByLinks(scds) {
    var map = new Map();
    function debug(msg) {
        if (scds.length > 0)
            scds[0].scriptInContext.debug('scripts').message(msg);
    }
    scds.forEach(function (scd) {
        var projectDetails = scd.detailsAndDirectory.projectDetails;
        if (!projectDetails)
            throw new Error("Cannot calculate generations as we have a directory without project.details.json [" + scd.detailsAndDirectory.directory + "]");
        map.set(projectDetails.name, scd);
    });
    debug(function () { return ['keys in the map of names to projects', __spreadArrays(map.keys()).sort()]; });
    if (scds.length !== map.size)
        throw new Error("Cannot calculate generations: multiple projects with the same name\n        " + scds.map(function (scd) { return scd.detailsAndDirectory.directory + " => " + scd.detailsAndDirectory.projectDetails.name; }).join(', '));
    if (scds.length !== map.size)
        throw new Error('Cannot calculate generations: multiple projects with the same name');
    var genNames = calculateAllGenerations(scds).generations;
    debug(function () { return __spreadArrays(['genNames'], genNames); });
    return genNames.map(function (names) { return names.map(function (n) { return map.get(n); }); });
}
exports.splitGenerationsByLinks = splitGenerationsByLinks;
function calcAllGenerationRecurse(scds, start) {
    var newGen = getChildrenRecurse(scds, start.existing);
    if (newGen.length == 0)
        return start;
    return calcAllGenerationRecurse(scds, { existing: __spreadArrays(start.existing, newGen), generations: __spreadArrays(start.generations, [newGen]) });
}
exports.calcAllGenerationRecurse = calcAllGenerationRecurse;
function prettyPrintGenerations(hasStream, scds, gen) {
    var log = utils_1.output(hasStream);
    gen.generations.forEach(function (g, i) {
        log("Generation " + i);
        log('  ' + g.join(", "));
    });
    var thisTree = {};
    var missing = new Set(scds.map(function (p) { return p.detailsAndDirectory.projectDetails.name; }));
    gen.generations.forEach(function (g) { return g.forEach(function (n) { return missing.delete(n); }); });
    if (missing.size > 0) {
        log('');
        log("Missing: can't put in a generation");
        log('  ' + __spreadArrays(missing).sort().join(","));
    }
}
exports.prettyPrintGenerations = prettyPrintGenerations;
function getChildrenRecurse(pds, existing) {
    var thisTree = {};
    pds.forEach(function (p) { return thisTree[p.detailsAndDirectory.projectDetails.name] = new Set(p.detailsAndDirectory.projectDetails.details.links); });
    var _loop_1 = function (k) {
        if (existing.includes(k))
            delete thisTree[k];
        else {
            var values_1 = thisTree[k];
            existing.forEach(function (e) { return values_1.delete(e); });
        }
    };
    for (var k in thisTree) {
        _loop_1(k);
    }
    for (var k in thisTree) {
        if (thisTree[k].size > 0)
            delete thisTree[k];
    }
    return __spreadArrays(Object.keys(thisTree)).sort();
}
