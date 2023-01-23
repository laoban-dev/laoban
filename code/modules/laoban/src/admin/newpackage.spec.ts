import { copyDirectory, inDirectoryFileOps, simplePath } from "@laoban/fileops";
import { fileOpsNode } from "@laoban/filesops-node";
import { testRoot } from "../fixture";
import { execute } from "../executors";
import { compareExpectedActualFile, compareExpectedActualFileInDirectory, compareExpectedActualFiles } from "./compareExpectedActualFiles";
import { cleanLineEndings } from "@laoban/utils";

const path = simplePath // so that we don't get windows/linux path issues in our tests
const fileOps = fileOpsNode ()

const newPackageDir = path.join ( testRoot, 'newpackage' )
const command = 'node ../../../../../code/modules/laoban/dist/index.js admin newpackage'

jest.setTimeout(30000);

async function clean ( dir: string, packages: string[] ) {
  const dirOps = inDirectoryFileOps ( fileOps, dir )
  for ( let p of packages ) {
    await dirOps.removeDirectory ( p, true )
  }
}
async function setup ( dir: string, ...packages: string[] ) {
  await clean ( dir, packages )
  const dirOps = inDirectoryFileOps ( fileOps, dir )
  for ( let p of packages ) {
    await copyDirectory ( dirOps, `start_${p}`, p )
  }

}

async function testIt ( category: string, test: string, command: string, pcks: string[] ) {
  const testDir = path.join ( newPackageDir, category, test )
  await setup ( testDir, ...pcks )
  console.log ( 'dir', testDir )
  const display = await execute ( path.join ( testDir, 'cwd' ), command )//+ " --load.laoban.debug" )
  const expected = await fileOps.loadFileOrUrl ( path.join ( testDir, 'expected.txt' ) )
  const cleanFn = ( s: string ) => cleanLineEndings ( s ).trim ()
  expect ( cleanFn ( display ) ).toEqual ( cleanFn ( expected ) )
  for ( let pck of pcks ) {
    await compareExpectedActualFiles ( fileOps, path.join ( testDir, `expected_${pck}` ), path.join ( testDir, pck ), cleanFn )
  }
  await clean ( testDir, pcks )
}
describe ( "newpackage", () => {
  describe ( "in the current package no package.json", () => {
    it ( "should make a typescript package -- happy path", async () => {
      await testIt ( 'currentDirectoryNoPackageJson', 'default', command, [ 'cwd' ] )
    } )
    it ( "should abort if package.details.json is found", async () => {
      await testIt ( 'currentDirectoryNoPackageJson', 'alreadyPackage', command, [ 'cwd' ] )
    } )

    it ( "should make if  package.details.json is found but --force specified", async () => {
      await testIt ( 'currentDirectoryNoPackageJson', 'alreadyPackageWithForce', command + ' --force', [ 'cwd' ] )
    } )

  } )
  describe ( "in a directory with existing content", () => {
    it ( "should make a typescript package -- happy path", async () => {
      await testIt ( 'otherDirectoryNoPackageJson', 'default', command + ' modules/pck', [ 'cwd' ] )
    } )
    it ( "should abort if package.details.json is found", async () => {
      await testIt ( 'otherDirectoryNoPackageJson', 'alreadyPackage', command + ' modules/pck', [ 'cwd' ] )

    } )
    it ( "should make if  package.details.json is found but --force specified", async () => {
      await testIt ( 'otherDirectoryNoPackageJson', 'alreadyPackageWithForce', command + ' modules/pck --force', [ 'cwd' ] )

    } )
  } )
  // describe ( "in a existing directory with a package.json", () => {
  //   it ( "should make a javascript package if init detects this as javascript", async () => {
  //
  //   } )
  //   it ( "should make a typescript package", async () => {} )
  // } )


} )
