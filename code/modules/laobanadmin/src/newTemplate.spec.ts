import { calculateNewTemplateOptions } from "./newTemplate";
import { fileOpsNode } from "@laoban/filesops-node";
import { copyFile, findChildDirs, findChildFiles, simplePath } from "@laoban/fileops";
import { execute } from "laoban/dist/src/executors";
import { testRoot, toArrayReplacingRoot } from "laoban/dist/src/fixture";
import { NullDebugCommands } from "@laoban/debug";

const path = simplePath // so that we don't get windows/linux path issues in our tests
const fileOps = fileOpsNode

describe ( "new template - calculateNewTemplateOptions", () => {
  const currentDirectory = 'C:\\laoban\\currentDirectory';

  describe ( "should use the last segment of the directory if no template name is specified", () => {
    it ( "should work with current directory and absolute path for template", () => {
      expect ( calculateNewTemplateOptions ( path, currentDirectory, { directory: currentDirectory, template: 'C:\\laoban\\fileHoldingSource' } ) )
        .toEqual ( {
          "directory": "C:\\laoban\\currentDirectory",
          "target": "C:\\laoban\\fileHoldingSource/currentDirectory",
          "templateName": "currentDirectory"
        } )
      expect ( calculateNewTemplateOptions ( path, currentDirectory, { directory: '/mnt/c/current', template: '/mnt/c/laoban/fileHoldingSource' } ) )
        .toEqual ( {
          "directory": "/mnt/c/current",
          "target": "/mnt/c/laoban/fileHoldingSource/current",
          "templateName": "current"
        } )
    } )
    it ( "should work with current directory and relative path for template", () => {
      expect ( calculateNewTemplateOptions ( path, currentDirectory, { directory: currentDirectory, template: 'modules/debug' } ) )
        .toEqual ( {
          "directory": "C:\\laoban\\currentDirectory",
          "target": "modules/debug/currentDirectory",
          "templateName": "currentDirectory"
        } )
    } )
  } )
  it ( "should use the template name if specified", () => {
    expect ( calculateNewTemplateOptions ( path, currentDirectory, { directory: currentDirectory, template: 'C:\\laoban\\fileHoldingSource', templatename: 'newname' } ) )
      .toEqual ( {
        "directory": "C:\\laoban\\currentDirectory",
        "target": "C:\\laoban\\fileHoldingSource/newname",
        "templateName": "newname"
      } )
  } )
} )
const prefix = 'node ../../../../code/modules/laobanadmin/dist/index.js '
const testDir = path.join ( testRoot, 'newTemplate' )
const passingDir = path.join ( testDir, 'passing' )
const passingSourceDir = path.join ( passingDir, 'source' )

async function compareExpectedActualFiles ( fileOps, expectedDir, actualDir ) {
  const expectedFiles = (await findChildFiles ( fileOps, () => false ) ( expectedDir )).sort ()
  const actualFiles = (await findChildFiles ( fileOps, () => false, ) ( actualDir )).sort ()
  expect ( actualFiles ).toEqual ( expectedFiles )
  return Promise.all ( actualFiles.map ( async ( file ) => {
    const expected = await fileOps.loadFileOrUrl ( path.join ( expectedDir, file ) )
    const actual = await fileOps.loadFileOrUrl ( path.join ( actualDir, file ) )
    expect ( actual ).toEqual ( expected )
  } ) )
}
async function cleanTestDirectories () {
  const files = (await fileOps.listFiles ( passingDir ))
    .filter ( s => s !== 'expected' && s !== 'source'  && s !== 'laoban.json' && s !== 'laoban.starting.json')
  await Promise.all ( files.map ( async f => {
    const name = path.join ( passingDir, f )
    if ( fileOps.isDirectory ( name ) ) return fileOps.removeDirectory ( name, true )
  } ) )
  await fileOps.removeDirectory ( path.join ( passingDir, 'source', 'templates' ), true )
  await fileOps.removeDirectory ( path.join ( passingDir, 'source', 'thenewtemplatedir' ), true )
  const laoban = await fileOps.loadFileOrUrl ( path.join ( passingDir, 'laoban.starting.json' ))
  await fileOps.saveFile(path.join ( passingDir, 'laoban.json' ), laoban)
}
describe ( "integration tests for newtemplate", () => {
  it ( "should create a new template in a templates subdir of current if no template dir given", async () => {
    await cleanTestDirectories ();
    const stdout = await execute (
      passingSourceDir,
      prefix + 'newtemplate' )
    expect ( toArrayReplacingRoot ( testDir, stdout ) ).toEqual ( [
      "Making template in <root>/passing/source/templates/source",
      "existingLaobanFile <root>/passing",
      "templates { something: 'here', source: 'source//templates//source' }"
    ])
    await compareExpectedActualFiles ( fileOps, path.join ( passingDir, 'expected' ), path.join ( passingDir, 'source', 'templates', 'source' ) )
  } )
  it ( "should create a new template under the specified templates dir", async () => {
    await cleanTestDirectories ();
    const stdout = await execute (
      passingSourceDir,
      prefix + 'newtemplate -t ../thenewtemplatedir' )
    expect ( toArrayReplacingRoot ( testDir, stdout ) ).toEqual ( [
      "Making template in ../thenewtemplatedir/source",
      "existingLaobanFile <root>/passing",
      "templates { something: 'here', source: 'thenewtemplatedir//source' }"
    ])
    await compareExpectedActualFiles ( fileOps, path.join ( passingDir, 'expected' ), path.join ( passingDir, 'thenewtemplatedir', 'source' ) )
  } )
  it ( "should create a new template under the specified templates dir when a name is given", async () => {
    await cleanTestDirectories ();
    const stdout = await execute (
      passingSourceDir,
      prefix + 'newtemplate -t ../thenewtemplatedir -n tempname' )
    expect ( toArrayReplacingRoot ( testDir, stdout ) ).toEqual ( [
      "Making template in ../thenewtemplatedir/tempname",
      "existingLaobanFile <root>/passing",
      "templates { something: 'here', tempname: 'thenewtemplatedir//tempname' }"
    ])
    await compareExpectedActualFiles ( fileOps, path.join ( passingDir, 'expected' ), path.join ( passingDir, 'thenewtemplatedir', 'tempname' ) )
  } )
  it("should clean up at end", async () =>{
    await cleanTestDirectories()
  })

} )