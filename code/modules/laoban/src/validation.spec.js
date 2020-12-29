"use strict";
//This is an integration test, but it's quite important
//The validation is a big part of the user experience
//The possible interactions between different parts of the validation are quite large..
//I suspect it will be a pain to keep these validation messages correct, so we might want to do something in the matching in the future
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var Files_1 = require("./Files");
var validation_1 = require("./validation");
var configProcessor_1 = require("./configProcessor");
var fixture_1 = require("./fixture");
// @ts-ignore
var debug_1 = require("@phil-rice/debug");
describe("validate laoban json", function () {
    fixture_1.dirsIn(fixture_1.testRoot).forEach(function (testDir) {
        it("should check the laobon.json validation for " + testDir, function () {
            var parsed = path.parse(testDir);
            var expected = fs.readFileSync(path.join(fixture_1.testRoot, testDir, 'expectedValidationLaoban.txt')).toString().split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
            var configOrIssues = configProcessor_1.loadConfigOrIssues(process.stdout, configProcessor_1.loadLoabanJsonAndValidate)(path.join(fixture_1.testRoot, testDir));
            expect(configOrIssues.issues).toEqual(expected);
        });
    });
});
describe("validate directories", function () {
    fixture_1.dirsIn(fixture_1.testRoot).forEach(function (testDir) {
        var parsed = path.parse(testDir);
        var configOrIssues = configProcessor_1.loadConfigOrIssues(process.stdout, configProcessor_1.loadLoabanJsonAndValidate)(testDir);
        if (configOrIssues.issues.length == 0) {
            it("should check the laoban.json and if that's ok, check the files under" + testDir, function () { return __awaiter(void 0, void 0, void 0, function () {
                var expected, config;
                return __generator(this, function (_a) {
                    expected = fs.readFileSync(path.join(testDir, 'expectedValidateProjectDetailsAndTemplate.txt')).toString().trim();
                    config = debug_1.addDebug(undefined, function () { })(configOrIssues.config);
                    return [2 /*return*/, Files_1.ProjectDetailFiles.workOutProjectDetails(config, {}). //
                            then(function (pds) { return validation_1.validateProjectDetailsAndTemplates(config, pds); }). //
                            then(function (actual) {
                            var expected = fs.readFileSync(path.join(testDir, 'expectedValidateProjectDetailsAndTemplate.txt')).toString().split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
                            expect(actual).toEqual(expected);
                        }, function (e) {
                            var expected = fs.readFileSync(path.join(testDir, 'expectedValidateProjectDetailsAndTemplate.txt')).toString().trim();
                            var msgLine1 = e.message.split("\n")[0];
                            expect(msgLine1).toEqual(expected);
                        })]; //
                });
            }); });
        }
    });
});
