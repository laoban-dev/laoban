import { postProcessTurnPackageJsonIntoTemplate } from "./packageJsonOps";
import { applyOrUndefined, emptyFileOps } from "@laoban/fileops";

describe ( 'postProcessTurnPackageJsonIntoTemplate', () => {
  it ( 'should add variables to the packageJson - empty', async () => {
    const actual = await applyOrUndefined(postProcessTurnPackageJsonIntoTemplate) ( 'someContext', emptyFileOps, {}, { file: 'whocares' } ) (
      JSON.stringify ( {} ), 'turnIntoPackageJsonTemplate' )
    const expected = JSON.stringify ( {
      "name": "${packageDetails.name}",
      "description": "${packageDetails.description}",
      "version": "${packageDetails.version}",
      "license": "${properties.license}",
      "repository": "${properties.repository}"
    }, null, 2 )
    expect ( actual ).toEqual ( expected )
  } )
  it ( 'should add variables to the packageJson - with content', async () => {
    const actual = await applyOrUndefined(postProcessTurnPackageJsonIntoTemplate) ( 'someContext', emptyFileOps, {}, { file: 'whocares' } ) (
      JSON.stringify ( { name: 'someName', version: 1, junk: 'someJunk' } ), 'turnIntoPackageJsonTemplate' )
    const expected = JSON.stringify ( {
      "name": "${packageDetails.name}",
      "version": "${packageDetails.version}",
      "junk": "someJunk",
      "description": "${packageDetails.description}",
      "license": "${properties.license}",
      "repository": "${properties.repository}"
    }, null, 2 )
    expect ( actual ).toEqual ( expected )
  } )
  it ( 'should return undefined if filecmd is not turnIntoPackageJsonTemplate', async () => {
    const actual = await applyOrUndefined(postProcessTurnPackageJsonIntoTemplate) ( 'someContext', emptyFileOps, {}, { file: 'whocares' } ) ( 'text', 'notTurnIntoPackageJsonTemplate' )
    expect ( actual ).toBeUndefined ()
  } )
} )