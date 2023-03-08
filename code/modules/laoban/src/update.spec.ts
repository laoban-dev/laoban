import { copyDirectory, simplePath } from "@laoban/fileops";
import { fileOpsNode } from "@laoban/filesops-node";
import { testRoot } from "./fixture";
import { execute } from "./executors";
import { compareExpectedActualFiles } from "@laoban/comparefiles";
import { cleanLineEndings } from "@laoban/utils";

jest.setTimeout ( 30000 );

const path = simplePath // so that we don't get windows/linux path issues in our tests
const fileOps = fileOpsNode ()
const updateTestRoot = fileOps.join ( testRoot, 'update' )
const prefix = `node ../../../../code/modules/laoban/dist/index.js `;

async function testIt ( dir: string ) {
  const root = path.join ( updateTestRoot, dir )
  const laobanDir = path.join ( root, "projects" )
  await fileOps.removeDirectory ( laobanDir, true )
  await copyDirectory ( fileOps, path.join ( root, 'starting' ), laobanDir )
  const disp = await execute ( laobanDir, `${prefix} update` )
  const expected = await fileOps.loadFileOrUrl ( path.join ( root, 'expectedDisplay.txt' ) )
  await fileOps.removeDirectory ( path.join ( laobanDir, '.cache' ), true )
  expect ( cleanLineEndings ( disp ) ).toEqual ( cleanLineEndings ( expected ) )
  await compareExpectedActualFiles ( fileOps,
    fileOps.join ( root, 'expected' ),
    fileOps.join ( root, 'projects' ) )
}

describe ( "laoban update", () => {
  it ( "should update mvn projects", async () => {
    await testIt ( "mvn" )
  } )
  it ( "should update mvn projects when group not specified in laoban.json", async () => {
    await testIt ( "mvnNoGroup" )
  } )
} )