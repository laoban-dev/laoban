import { dirsIn, execute, executeCli, testRoot, toArrayReplacingRoot } from "./fixture";
import path from "path";
import fs from "fs";

let experimental = false

function doPwd ( cmd: string, expectedFile: string ) {
  describe ( cmd, () => {
    dirsIn ( testRoot ).map ( d => path.join ( testRoot, d ) ).forEach ( testDir => {
      let expected = toArrayReplacingRoot ( fs.readFileSync ( path.join ( testDir, expectedFile ) ).toString () )
      it ( `should return ${expectedFile} when ${cmd} is run in ${path.parse ( testDir ).name}. Fullname${testDir}`, async () => {
          await experimental ?
            await executeCli ( testDir, cmd ).then ( actual => expect ( toArrayReplacingRoot ( actual ) ).toEqual ( expected ) ) :
            await execute ( testDir, cmd ).then ( result => {
              let actual = toArrayReplacingRoot ( result );
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
const  prefix = "node ../../../code/modules/laoban/dist/index.js ";
doPwd ( prefix + "ls", 'expectedLs.txt' ) //tests dos execution
doPwd ( prefix +"packages", 'expectedPackages.txt' ) //tests a command
doPwd ( prefix + `run "js:process.cwd()"`, 'expectedPwds.txt' ) // tests javascript execution
