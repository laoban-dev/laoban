import { fileOpsNode } from "@laoban/filesops-node";
import { testRoot } from "../fixture";
import { execute } from "../executors";
import { compareExpectedActualFileInDirectory } from "./compareExpectedActualFiles";
import { cleanLineEndings } from "@laoban/utils";
import { inDirectoryFileOps } from "@laoban/fileops/src/fileOps";


const fileOps = fileOpsNode ();

const initTestRoot = fileOps.join ( testRoot, 'init' )
const prefix = "node ../../../code/modules/laoban/dist/index.js ";

async function clean ( dir: string ) {
  await fileOps.removeFile ( fileOps.join ( dir, 'laoban.json' ) )
  await fileOps.removeFile ( fileOps.join ( dir, 'version.txt' ) )
  await fileOps.removeFile ( fileOps.join ( dir, 'lib1/package.details.json' ) )
  await fileOps.removeFile ( fileOps.join ( dir, 'lib2/package.details.json' ) )
}

async function setupInitialValues ( dir: string ) {
  const localOps = inDirectoryFileOps ( fileOps, dir );
  await localOps.saveFile ( 'version.txt', await localOps.loadFileOrUrl ( 'version.initial.txt' ) )
  await localOps.saveFile ( 'laoban.json', await localOps.loadFileOrUrl ( 'laoban.initial.json' ) )
  await localOps.saveFile ( 'lib1/package.details.json', await localOps.loadFileOrUrl ( 'lib1/package.details.initial.json' ) )
  await localOps.saveFile ( 'lib2/package.details.json', await localOps.loadFileOrUrl ( 'lib2/package.details.initial.json' ) )
}
async function testInit ( testDir: string ) {
  const compare = compareExpectedActualFileInDirectory ( fileOps, testDir );
  const actualDisplay = await execute ( testDir, `${prefix} admin init --force` )
  const expected = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'expected.txt' ) )
  expect ( cleanLineEndings ( actualDisplay ) ).toEqual ( cleanLineEndings ( expected ) )

  await compare ( 'lib1/package.details.expected.json', 'lib1/package.details.json' );
  await compare ( 'lib2/package.details.expected.json', 'lib2/package.details.json' );
  await compare ( 'laoban.json', 'laoban.expected.json' );
  await compare ( 'version.txt', 'version.expected.txt' );
}
describe ( "laoban init", () => {
  it ( "should be able to init where there are no existing laoban files", async () => {
    const testDir = fileOps.join ( initTestRoot, 'hasgit' );
    await clean ( testDir )
    await testInit ( testDir );
    await clean ( testDir )
  } )

  it ( "should be able to init where there are existing laoban files", async () => {
    const testDir = fileOps.join ( initTestRoot, 'alreadySetup' );
    await clean ( testDir )
    await setupInitialValues ( testDir )
    await testInit ( testDir );
    await clean ( testDir )
  } )
} )
