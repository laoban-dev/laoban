import { fileOpsNode } from "@laoban/filesops-node";
import { testRoot } from "../fixture";
import { execute } from "../executors";
import { cleanLineEndings } from "@laoban/utils";


const fileOps = fileOpsNode ();

const updateTemplateTestRoot = fileOps.join ( testRoot, 'analyzepackage' )
const prefix = "node ../../../code/modules/laoban/dist/index.js ";

describe ( "laoban analyzepackages", () => {
  it ( "should be able to analyse packages - no laoban.json", async () => {
    const testDir = fileOps.join ( updateTemplateTestRoot, 'empty' );
    const actualDisplay = await execute ( testDir, `${prefix} admin analyzepackages` )
    const expected = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'expected.txt' ) )
    expect ( cleanLineEndings ( actualDisplay ) ).toEqual ( cleanLineEndings ( expected ) )
  } )
  it ( "should be able to analyse packages - has laoban.json", async () => {
    const testDir = fileOps.join ( updateTemplateTestRoot, 'haslaoban.json' );
    const actualDisplay = await execute ( testDir, `${prefix} admin analyzepackages` )
    const expected = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'expected.txt' ) )
    expect ( cleanLineEndings ( actualDisplay ) ).toEqual ( cleanLineEndings ( expected ) )
  } )
} )

describe ( "laoban analyzepackages --showimpact", () => {
  it ( "should be able to analyse packages - no laoban.json", async () => {
    const testDir = fileOps.join ( updateTemplateTestRoot, 'empty' );
    const actualDisplay = await execute ( testDir, `${prefix} admin analyzepackages --showimpact` )
    const expected = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'expectedShowImpact.txt' ) )
    expect ( cleanLineEndings ( actualDisplay ) ).toEqual ( cleanLineEndings ( expected ) )
  } )
  it ( "should be able to analyse packages - has laoban.json", async () => {
    const testDir = fileOps.join ( updateTemplateTestRoot, 'haslaoban.json' );
    const actualDisplay = await execute ( testDir, `${prefix} admin analyzepackages --showimpact` )
    const expected = await fileOps.loadFileOrUrl ( fileOps.join ( testDir, 'expectedShowImpact.txt' ) )
    expect ( cleanLineEndings ( actualDisplay ) ).toEqual ( cleanLineEndings ( expected ) )
  } )
} )