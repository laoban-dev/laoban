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
exports.shellReporter = void 0;
var executors_1 = require("./executors");
var fse = require("fs-extra");
var utils_1 = require("./utils");
function reporter(outputStream, gen, reportDecorator) {
    var log = utils_1.output({ outputStream: outputStream });
    var result = Promise.all(gen.map(function (sr, i) {
        var logFile = executors_1.streamName(sr.scd);
        return Promise.all(sr.scd.streams.map(function (s) { return new Promise(function (resolve, reject) {
            sr.scd.logStream.on('finish', function () { return resolve(logFile); });
        }); })).then(function () { return logFile; });
    })).then(function (fileNames) { return fileNames.map(function (logFile) {
        if (gen.length > 0) {
            var report = { scd: gen[0].scd, text: fse.readFileSync(logFile).toString() };
            var message = reportDecorator(report).text;
            if (message.length > 0)
                log(message.trimRight());
        }
    }); });
    gen.forEach(function (sr) { return sr.scd.streams.forEach(function (s) { return s.end(); }); });
    return result.then(function () { });
}
var prefixLinesThatDontStartWithStar = function (s) { return s.split('\n').map(function (s) { return s.startsWith('*') ? s : '        ' + s; }).join('\n'); };
var shellReportDecorator = function (report) {
    return report.scd.scriptInContext.shell ? __assign(__assign({}, report), { text: prefixLinesThatDontStartWithStar(report.text) }) :
        report;
};
var quietDecorator = function (report) { return report.scd.scriptInContext.quiet ? __assign(__assign({}, report), { text: '' }) : report; };
function chainReports(decorators) { return function (report) { return decorators.reduce(function (acc, r) { return r(acc); }, report); }; }
var reportDecorators = chainReports([shellReportDecorator, quietDecorator]);
exports.shellReporter = function (outputStream) {
    return function (gen) { return reporter(outputStream, gen, reportDecorators); };
};
