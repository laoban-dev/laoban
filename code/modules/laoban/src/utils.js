"use strict";
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Maps = exports.partition = exports.groupBy = exports.writeTo = exports.chain = exports.output = exports.Strings = exports.removeDuplicates = exports.flatten = void 0;
function flatten(list) {
    return [].concat.apply([], list);
}
exports.flatten = flatten;
function removeDuplicates(list) {
    return __spreadArrays(new Set(list));
}
exports.removeDuplicates = removeDuplicates;
var Strings = /** @class */ (function () {
    function Strings() {
    }
    Strings.indentEachLine = function (indent, lines) {
        return lines.split('\n').map(function (s) { return indent + s; }).join('\n');
    };
    Strings.maxLength = function (ss) { return Math.max.apply(Math, (ss.map(function (s) { return s.length; }))); };
    return Strings;
}());
exports.Strings = Strings;
exports.output = function (c) {
    return function (s) { return c.outputStream.write(s + "\n"); };
};
function chain(decorators) {
    return function (raw) { return decorators.reduce(function (acc, v) { return v(acc); }, raw); };
}
exports.chain = chain;
function writeTo(ws, data) {
    ws.forEach(function (s) { return s.write(data); });
}
exports.writeTo = writeTo;
function groupBy(xs, by) {
    return xs.reduce(function (rv, x) {
        (rv[by(x)] = rv[by(x)] || []).push(x);
        return rv;
    }, {});
}
exports.groupBy = groupBy;
exports.partition = function (arr, length) {
    var result = [];
    for (var i = 0; i < arr.length; i++) {
        if (i % length === 0)
            result.push([]);
        result[result.length - 1].push(arr[i]);
    }
    return result;
};
var Maps = /** @class */ (function () {
    function Maps() {
    }
    Maps.add = function (map, k, v) {
        var existing = map.get(k);
        if (existing) {
            existing.push(v);
        }
        else {
            map.set(k, [v]);
        }
    };
    Maps.addAll = function (map, k, vs) {
        var existing = map.get(k);
        if (existing) {
            vs.forEach(function (v) { return existing.push(v); });
        }
        else {
            map.set(k, __spreadArrays(vs));
        }
    };
    return Maps;
}());
exports.Maps = Maps;
