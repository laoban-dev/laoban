import { findChildFiles } from "@laoban/fileops";
import { cleanLineEndings } from "@laoban/utils";


export async function compareExpectedActualFiles ( fileOps, expectedDir, actualDir ) {
  const expectedFiles = (await findChildFiles ( fileOps, () => false ) ( expectedDir )).sort ()
  const actualFiles = (await findChildFiles ( fileOps, () => false, ) ( actualDir )).sort ()
  expect ( actualFiles ).toEqual ( expectedFiles )
  return Promise.all ( actualFiles.map ( async ( file ) => {
    const expected = await fileOps.loadFileOrUrl ( fileOps.join ( expectedDir, file ) )
    const actual = await fileOps.loadFileOrUrl ( fileOps.join ( actualDir, file ) )
    expect ( cleanLineEndings ( actual ) ).toEqual ( cleanLineEndings ( expected ) )
  } ) )
}