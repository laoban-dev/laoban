import { dirsIn, execute, executeCli, testRoot, toArrayReplacingRoot } from "./fixture";
import path from "path";
import fs from "fs";

let experimental = false

function doPwd ( cmd: string, expectedFile: string ) {
  describe ( cmd, () => {
    dirsIn ( testRoot ).map ( d => path.join ( testRoot, d ) ).forEach ( testDir => {
      let expected = toArrayReplacingRoot ( fs.readFileSync ( path.join ( testDir, expectedFile ) ).toString () )
      it ( `should return ${expectedFile} when ${cmd} is run in ${path.parse ( testDir ).name}. Fullname${testDir}`, async () => {
          experimental ?
            executeCli ( testDir, cmd ).then ( actual => expect ( toArrayReplacingRoot ( actual ) ).toEqual ( expected ) ) :
            execute ( testDir, cmd ).then ( actual => expect ( toArrayReplacingRoot ( actual ) ).toEqual ( expected ) )
        }
      )
    } )
  } )

}
doPwd ( "laoban ls", 'expectedLs.txt' ) //tests dos execution
doPwd ( "laoban projects", 'expectedProjects.txt' ) //tests a command
doPwd ( "laoban run 'js:process.cwd()'", 'expectedPwds.txt' ) // tests javascript execution
