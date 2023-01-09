import { configTestRoot, dirsIn,  executeCli, testRoot, toArrayReplacingRoot } from "./fixture";
import path from "path";
import fs from "fs";
import { execute } from "./executors";

let experimental = false

function doPwd ( cmd: string, expectedFile: string ) {
  describe ( cmd, () => {
    dirsIn ( configTestRoot ).map ( d => path.join ( configTestRoot, d ) ).map ( testDir => {
      let expected = toArrayReplacingRoot ( configTestRoot, fs.readFileSync ( path.join ( testDir, expectedFile ) ).toString () )
      it ( `should return ${expectedFile} when ${cmd} is run in ${path.parse ( testDir ).name}. Fullname${testDir}`, async () => {
          await experimental ?
            await executeCli ( testDir, cmd ).then ( actual => expect ( toArrayReplacingRoot ( configTestRoot, actual ) ).toEqual ( expected ) ) :
            await execute ( testDir, cmd ).then ( result => {
              let actual = toArrayReplacingRoot ( configTestRoot, result );
              // console.log ( 'cmd', expectedFile )
              // console.log ( 'expected', expected )
              // console.log ( 'actual', actual )
              return expect ( actual ).toEqual ( expected );
            } )
        }
      )
    } )
  } )

}
const prefix = "node ../../../code/modules/laoban/dist/index.js ";
doPwd ( prefix + "ls", 'expectedLs.txt' ) //tests dos execution
doPwd ( prefix + "packages", 'expectedPackages.txt' ) //tests a command
doPwd ( prefix + `run "js:process.cwd()"`, 'expectedPwds.txt' ) // tests javascript execution

describe ( 'ls with guards', () => {
  const prefix = "node ../../code/modules/laoban/dist/index.js ";
  const testDir = path.join ( testRoot, 'guards' )
  it ( 'ls should list the packages with the guard set to true', async () => {
    const actual = toArrayReplacingRoot ( testDir, await execute ( testDir, prefix + ' ls' ) )
    expect ( actual ).toEqual ( toArrayReplacingRoot ( testDir, "<root>\\projWithGuard_A" ) )
  } )
  it ( 'defaultTrueGuard should list the packages with the guards not set to false', async () => {
    const actual = toArrayReplacingRoot ( testDir, await execute ( testDir, prefix + ' defaultTrueGuard' ) )
    expect ( actual ).toEqual ( toArrayReplacingRoot ( testDir, "<root>/projWithGuard_A\n<root>/projWithoutGuard" ) )
  } )
  it ( 'guardMatchingA should list the packages with the guardValue set to A', async () => {
    const actual = toArrayReplacingRoot ( testDir, await execute ( testDir, prefix + ' guardMatchingA' ) )
    expect ( actual ).toEqual ( toArrayReplacingRoot ( testDir, "<root>\\projWithGuard_A" ) )
  } )
  it ( 'aAndBDifferent should list the packages differently depending on the guard value', async () => {
    const actual = toArrayReplacingRoot ( testDir, await execute ( testDir, prefix + ' aAndBDifferent' ) )
    expect ( actual ).toEqual ( toArrayReplacingRoot ( testDir, "A <root>/projWithGuard_A\nB <root>/projWithGuard_B" ) )
  } )

} )