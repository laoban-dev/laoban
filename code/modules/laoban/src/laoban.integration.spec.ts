//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { configTestRoot, dirsIn, executeCli, testRoot, toArrayReplacingRoot } from "./fixture";
import path from "path";
import fs from "fs";
import { execute } from "./executors";
import { parseJson } from "@laoban/fileops";
import { fileOpsNode } from "@laoban/filesops-node";
jest.setTimeout(15000);
let experimental = false

function doPwd ( cmd: string, expectedFile: string ) {
  let displayCmd = cmd.split(' ').filter( s=> s.length>0).slice(2).join(' ');
  describe (  displayCmd, () => {
    dirsIn ( configTestRoot ).map ( d => path.join ( configTestRoot, d ) ).map ( testDir => {
      let expected = toArrayReplacingRoot ( configTestRoot, fs.readFileSync ( path.join ( testDir, expectedFile ) ).toString () )
      it ( `should return ${expectedFile} when ${displayCmd} is run in ${path.parse ( testDir ).name}. Fullname${testDir}`, async () => {
          await experimental ?
            await executeCli ( testDir, cmd ).then ( actual => expect ( toArrayReplacingRoot ( configTestRoot, actual ) ).toEqual ( expected ) ) :
            await execute ( testDir, cmd ).then ( result => {
              let actual = toArrayReplacingRoot ( configTestRoot, result );
              // console.log ( 'cmd', expectedFile )
              // console.log ( 'expected', expected )
              try {
                return expect ( actual ).toEqual ( expected );
              } catch ( e ) {
                console.log ( 'actual\n', actual.join ( '\n' ) )
                console.log ( '---' )
                throw e
              }
            } )
        }
      )
    } )
  } )

}
const prefix = "node ../../../code/modules/laoban/dist/index.js ";
doPwd ( prefix + "ls", 'expectedLs.txt' ) //tests dos execution
doPwd ( prefix + "packages", 'expectedPackages.txt' ) //tests a command
doPwd ( prefix + "admin config", 'expectedConfig.txt' ) //tests a command
doPwd ( prefix + "admin validate", 'expectedValidate.txt' ) //tests a command
doPwd ( prefix + "admin templates", 'expectedTemplates.txt' ) //tests a command
doPwd ( prefix + "admin analyze", 'expectedAnalyze.txt' ) //tests a command
doPwd ( prefix + `run "js:process.cwd()"`, 'expectedPwds.txt' ) // tests javascript execution
doPwd ( prefix + `update`, 'expectedUpdate.txt' ) // tests javascript execution

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

describe ( "defaultEnvs", () => {
  const prefix = "node ./dist/index.js ";
  const testDir = '.'
  it ( 'should have the default envs in the config', async () => {
    const actual = await execute ( testDir, prefix + ' admin config' )
    const json = parseJson<any> ( `parsing output of laoban admin config` ) ( actual )
    expect ( json.defaultEnv ).toEqual ( { "TEST_DEFAULT": "test" } )
  } )

  it ( 'have access to the default env in scripts', async () => {
    delete process.env.TEST_DEFAULT
    const actual = await execute ( testDir, prefix + `run "js:process.env.TEST_DEFAULT"` )
    expect ( actual.trim () ).toEqual ( "test" )
  } )

  it ( `have access to the real env in scripts (the default doesn't override it`, async () => {
    process.env.TEST_DEFAULT = 'setvalue'
    const actual = await execute ( testDir, prefix + `run "js:process.env.TEST_DEFAULT"` )
    expect ( actual.trim () ).toEqual ( "setvalue" )
  } )
} )