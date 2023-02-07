import { FileOps, findChildFiles } from "@laoban/fileops";
import { cleanLineEndings } from "@laoban/utils";

export const compareExpectedActualFile = ( fileOps: FileOps, options?: CompareFileOptions ) => async ( expectedFile, actualFile ) => {
  const realCleanFn = options?.cleanFn || cleanLineEndings
  if ( options?.ignoreFn && options.ignoreFn ( expectedFile ) ) return

  const expected = await fileOps.loadFileOrUrl ( expectedFile )
  const actual = await fileOps.loadFileOrUrl ( actualFile )
  try {
    expect ( realCleanFn ( actual ) ).toEqual ( realCleanFn ( expected ) )
  } catch ( e ) {
    console.log ( `Error comparing ${expectedFile} to ${actualFile}` )
    throw e
  }
};
export const compareExpectedActualFileInDirectory = ( fileOps: FileOps, dir: string ) => async ( expectedFile, actualFile ) => {
  const expected = await fileOps.loadFileOrUrl ( fileOps.join ( dir, expectedFile ) )
  const actual = await fileOps.loadFileOrUrl ( fileOps.join ( dir, actualFile ) )
  expect ( cleanLineEndings ( actual ) ).toEqual ( cleanLineEndings ( expected ) )
};

export interface CompareFileOptions {
  cleanFn?: ( s: string ) => string
  ignoreFn?: ( s: string ) => boolean
}
export async function compareExpectedActualFiles ( fileOps: FileOps, expectedDir: string, actualDir: string, options?: CompareFileOptions ) {
  const ignore = options?.ignoreFn || (() => false)
  const compare = compareExpectedActualFile ( fileOps, options );
  const expectedFiles = (await findChildFiles ( fileOps, ignore ) ( expectedDir )).sort ()
  if ( await fileOps.isDirectory ( actualDir ) === false ) throw Error ( `Expected ${actualDir} to be a directory. It was expected to be created and isn't` )
  const actualFiles = (await findChildFiles ( fileOps, ignore ) ( actualDir )).sort ()
  try {
    expect ( actualFiles ).toEqual ( expectedFiles )
  } catch ( e ) {
    console.log ( `Comparing ${expectedDir} to ${actualDir}` )
    throw e
  }
  return Promise.all ( actualFiles.map ( file => compare ( fileOps.join ( expectedDir, file ), fileOps.join ( actualDir, file ) ) ) )
}