import {dirsIn, execute, fullPathsOfTestDirs, pwd, testRoot} from "./fixture";
import path from "path";
import {findLaoban} from "./Files";
import * as os from "os";
import fs from "fs";


describe("laoban run js:process.cwd()", () => {
    let cmd = "laoban run 'js:process.cwd()'"
    let rootMatch = new RegExp(testRoot, "g")
    dirsIn(testRoot).map(d => path.join(testRoot, d)).forEach(testDir => {
        let expected = fs.readFileSync(path.join(testDir, 'expectedPwds.txt')).toString().split('\n').map(s => s.trim()).map(s => s.replace(rootMatch, "<root>")).filter(s => s.length > 0)
        it(`should return the paths of just the current project when run in ${path.parse(testDir).name}`, async () =>
            execute(testDir, cmd).then(actual => expect(actual.map(s =>  s.replace(rootMatch, "<root>"))).toEqual(expected)))
    })
})
//
// describe(`laoban run ${pwd}`, () => {
//     let cmd = `laoban run ${pwd}`;
//     it("should return the paths of all the test projects when run in root directory", () => {
//         let actual = execute(testRoot, cmd)
//         expect(actual).toEqual(fullPathsOfTestDirs)
//     })
//
//     it("should return the paths of just the current project when run in test directory", () => {
//         dirsIn('test').map(d => path.resolve(d)).forEach(testDir => {
//             let actual = execute(testRoot, cmd)
//             expect(actual).toEqual([testDir])
//         })
//     })
// })
//
// describe("laoban projects", () => {
//     it("should return all the projects", () => {
//         let actual = execute(findLaoban(process.cwd()), 'laoban projects')
//         expect(actual).toEqual(fullPathsOfTestDirs)
//     })
// })