import { fileOpsNode } from '@laoban/filesops-node'
import { testRoot } from "../fixture";
import { execute } from "../executors";
import { compareExpectedActualFiles } from "./compareExpectedActualFiles";
import { copyFiles, FileOps } from "@laoban/fileops";
import { cleanLineEndings } from "@laoban/utils";
import { NullDebugCommands } from "@laoban/debug";

const fileOps = fileOpsNode ();

const updateTemplateTestRoot = fileOps.join ( testRoot, 'updateTemplate' )
const prefix = "node ../../../code/modules/laoban/dist/index.js ";

async function cleanUpDirectory ( fileOps: FileOps, testDir: string, cleanTemplates: boolean ) {
  const laoban = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'laoban.starting.json' ) )
  await fileOps.saveFile ( fileOps.join ( testDir, 'laoban.json' ), laoban )
  const templatesDir = fileOps.join ( testDir, 'templates', 'typescript' );
  if ( cleanTemplates ) await fileOps.removeDirectory ( templatesDir, true )
  const startTemplateDir = fileOps.join ( testDir, 'startTemplates', 'typescript' )
  if ( await fileOps.isDirectory ( startTemplateDir ) ) {
    await fileOps.createDir(templatesDir)
    const cf = copyFiles ( '', fileOps, NullDebugCommands, startTemplateDir, templatesDir, {} )
    const files = await fileOps.listFiles ( startTemplateDir );
    await cf ( files )
  }
}
async function testIt ( directory: string, cleanTemplates: boolean ) {
  const testDir = fileOps.join ( updateTemplateTestRoot, directory );
  cleanUpDirectory ( fileOps, testDir, cleanTemplates )
  const actualDisplay = await execute ( testDir, `${prefix} admin updatetemplate --directory package` )

  // expect ( actual ).toEqual ( `Updated template in ${fileOps.join ( updateTemplateTestRoot, directory, 'package' )}` )
  const expectedLaoban = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'laoban.expected.json' ) )
  const actualLaoban = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'laoban.json' ) )
  await compareExpectedActualFiles ( fileOps,
    fileOps.join ( testDir, 'expected' ),
    fileOps.join ( testDir, 'templates', 'typescript' ) )
  expect ( cleanLineEndings ( actualLaoban ) ).toEqual ( cleanLineEndings ( expectedLaoban ) )
  await cleanUpDirectory ( fileOps, testDir, cleanTemplates )
}

describe ( "update template", () => {
  it ( "'blankstart' should make a package.json and a .template.json", async () => {
    await testIt ( "blankstart", true )
  } );
  it ( "'existing' should make a package.json and a .template.json", async () => {
    await testIt ( "existing", false )
  } );
} )