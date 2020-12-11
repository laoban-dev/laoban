import {dirsIn, execute, testRoot, toArrayReplacingRoot} from "./fixture";
import path from "path";
import fs from "fs";


function doPwd(cmd: string, expectedFile: string) {
    describe(cmd, () => {
        dirsIn(testRoot).map(d => path.join(testRoot, d)).forEach(testDir => {
            let expected = toArrayReplacingRoot(fs.readFileSync(path.join(testDir, expectedFile)).toString())
            it(`should return the paths of just the current project when run in ${path.parse(testDir).name}`, async () =>
                execute(testDir, cmd).then(actual => expect(toArrayReplacingRoot(actual)).toEqual(expected)))
        })
    })

}
doPwd("laoban run 'js:process.cwd()'",'expectedPwds.txt') // tests javascript execution
doPwd("laoban projects",'expectedPwds.txt') //tests a command
doPwd("laoban ls",'expectedLs.txt') //tests dos execution
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