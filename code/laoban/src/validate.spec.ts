//This is an integration test, but it's quite important
//The validation is a big part of the user experience
//The possible interactions between different parts of the validation are quite large..
//I suspect it will be a pain to keep these validation messages correct, so we might want to do something in the matching in the future

import * as fs from "fs";
import * as path from "path";
import {loabanConfigName, ProjectDetailFiles} from "./Files";
import {validateLaobanJson, validateProjectDetailsAndTemplates} from "./validation2";
import {Config, RawConfig} from "./config";
import {Validate} from "./val";
import {configProcessor, loadConfigOrIssues, loadLoabanJsonAndValidate} from "./configProcessor";

function dirsIn(root: string) {
    let testRoot = path.join('..', '..', 'tests')
    return fs.readdirSync(testRoot).map(testDirName => path.join(testRoot, testDirName)).filter(d => fs.statSync(d).isDirectory())

}
describe("validate laoban json", () => {
    dirsIn('tests').forEach(testDir =>
        it(`should check the laobon.json validation for ${testDir}`, () => {
            let parsed = path.parse(testDir)
            let expected = fs.readFileSync(path.join(testDir, 'expectedValidationLaoban.txt')).toString().split('\n').map(s => s.trim()).filter(s => s.length > 0)
            let configOrIssues = loadConfigOrIssues(loadLoabanJsonAndValidate)(testDir)
            expect(configOrIssues.issues).toEqual(expected)
        }))
})

describe("validate directories", () => {
    dirsIn('tests').forEach(testDir => {
        let parsed = path.parse(testDir)
        let configOrIssues = loadConfigOrIssues(loadLoabanJsonAndValidate)(testDir)
        if (configOrIssues.issues.length == 0) {
            it(`should check the laoban.json and if that's ok, check the files under${testDir}`, async () => {
                let expected = fs.readFileSync(path.join(testDir, 'expectedValidateProjectDetailsAndTemplate.txt')).toString().trim()
                let config: Config = configOrIssues.config
                return ProjectDetailFiles.workOutProjectDetails(config, {}).//
                    then(pds => validateProjectDetailsAndTemplates(config, pds)).//
                    then(actual => {
                            let expected = fs.readFileSync(path.join(testDir, 'expectedValidateProjectDetailsAndTemplate.txt')).toString().split('\n').map(s => s.trim()).filter(s => s.length > 0)
                            expect(actual).toEqual(expected)
                        },
                        e => {
                            let expected = fs.readFileSync(path.join(testDir, 'expectedValidateProjectDetailsAndTemplate.txt')).toString().trim()
                            let msgLine1: string = e.message.split("\n")[0];
                            expect(msgLine1).toEqual(expected)
                        })//
            })
        }
    })
})
