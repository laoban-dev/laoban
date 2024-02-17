import { fileOpsNode } from "./fileOpsNode";
import { defaultIgnoreFilter, scanDirectory } from "@laoban/fileops";


const fileOps = fileOpsNode ()
describe ( "scan", () => {
  it ( "should find files that match the find filter", async () => {

    const testDir = process.cwd ()

    const result = await scanDirectory ( fileOps, defaultIgnoreFilter ) ( testDir, s => s.endsWith ( ".spec.ts" ) )
    expect ( result.map ( s => s.replace ( testDir, '<root>' ).replace ( /\\/g, '/' ) ) ).toEqual ( [
      "<root>/src/fileOpsNode.spec.ts",
      "<root>/src/scan.spec.ts"
    ] )
  } )
} )