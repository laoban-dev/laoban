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
import {configProcessor} from "./configProcessor";
import instantiateStreaming = WebAssembly.instantiateStreaming;

function dirsIn(root: string) {
    return fs.readdirSync('tests').map(testDirName => path.join('tests', testDirName)).filter(d => fs.statSync(d).isDirectory())

}
describe("validate laoban json", () => {
    dirsIn('tests').forEach(testDir =>
        it(`should check the laobon.json validation for ${testDir}`, () => {
            let parsed = path.parse(testDir)
            let expected = fs.readFileSync(path.join(testDir, 'expectedValidationLaoban.txt')).toString().split('\n').map(s => s.trim()).filter(s => s.length > 0)
            let json = JSON.parse(fs.readFileSync(path.join(testDir, loabanConfigName)).toString())
            let actual = validateLaobanJson(Validate.validate<RawConfig>(parsed.name, json, false)).errors
            // console.log(testDir, expected, actual)
            expect(actual).toEqual(expected)
        }))
})

describe("validate directories", () => {
    dirsIn('tests').forEach(testDir => {
        let parsed = path.parse(testDir)
        let raw = JSON.parse(fs.readFileSync(path.join(testDir, loabanConfigName)).toString())
        let check = validateLaobanJson(Validate.validate<RawConfig>(parsed.name, raw, false)).errors
        if (check.length == 0) {
            it(`should check the laoban.json and if that's ok, check the files under${testDir}`, async () => {
                let expected = fs.readFileSync(path.join(testDir, 'expectedValidateProjectDetailsAndTemplate.txt')).toString().trim()
                let config: Config = configProcessor(testDir, raw)
                return ProjectDetailFiles.workOutProjectDetails(testDir, {}).//
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
