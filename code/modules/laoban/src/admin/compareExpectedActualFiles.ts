import { FileOps, findChildFiles } from "@laoban/fileops";
import { cleanLineEndings } from "@laoban/utils";

export const compareExpectedActualFile = ( fileOps: FileOps ) => async ( expectedFile, actualFile ) => {
  const expected = await fileOps.loadFileOrUrl ( expectedFile )
  const actual = await fileOps.loadFileOrUrl ( actualFile )
  try {
    expect ( cleanLineEndings ( actual ) ).toEqual ( cleanLineEndings ( expected ) )
  } catch ( e ) {
    console.log(`Comparing ${expectedFile} to ${actualFile}`)
    throw e
  }
};
export const compareExpectedActualFileInDirectory = ( fileOps: FileOps, dir: string ) => async ( expectedFile, actualFile ) => {
  const expected = await fileOps.loadFileOrUrl (fileOps.join(dir, expectedFile ))
  const actual = await fileOps.loadFileOrUrl ( fileOps.join(dir, actualFile ) )
  expect ( cleanLineEndings ( actual ) ).toEqual ( cleanLineEndings ( expected ) )
};
export async function compareExpectedActualFiles ( fileOps, expectedDir, actualDir ) {
  const compare = compareExpectedActualFile ( fileOps );
  const expectedFiles = (await findChildFiles ( fileOps, () => false ) ( expectedDir )).sort ()
  const actualFiles = (await findChildFiles ( fileOps, () => false, ) ( actualDir )).sort ()
  try{
    expect ( actualFiles ).toEqual ( expectedFiles )
  }catch (e){
    console.log(`Comparing ${expectedDir} to ${actualDir}`)
    throw e
  }
  return Promise.all ( actualFiles.map ( file => compare ( fileOps.join ( expectedDir, file ), fileOps.join ( actualDir, file ) ) ) )
}