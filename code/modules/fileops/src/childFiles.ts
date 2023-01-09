import { LocationAndContents } from "./locationAnd";
import { FileOps, findMatchingK } from "./fileOps";
import { flatMap, flatten, lastSegment } from "@laoban/utils";

export const addPrefix = ( s1: string ) => ( s2: string ) => s1 === '' ? s2 : s1 + '/' + s2
export const childDirs = ( fileOps: FileOps, stopDirFilter: ( s: string ) => boolean ) => ( root: string ): Promise<string[]> => {
  const children = async ( parent: string ): Promise<string[]> => {
    const files: string[] = await fileOps.listFiles ( parent )
    const withParent = files.filter ( d => !stopDirFilter ( d ) ).map ( addPrefix ( parent ) )
    const directories: string[] = await findMatchingK ( withParent, fileOps.isDirectory )
    let result: string[] = [ ...directories ]
    let descendents = await Promise.all ( result.map ( children ) )
    descendents.forEach ( c => result.push ( ...c ) )
    return result
  };
  return children ( root )
};
export async function loadAllFilesIn ( fileOps: FileOps, directory: string ): Promise<LocationAndContents<string>[]> {
  const contents = await fileOps.listFiles ( directory )
  const files = await findMatchingK ( contents, fileOps.isFile )
  return await Promise.all<LocationAndContents<string>> ( files.map ( location => fileOps.loadFileOrUrl ( location ).then (
    contents => ({ location, directory, contents }),
    raw => ({ location: location, raw, errors: [ `Error loading ${location}. ${raw}` ] }) ) ) )
}

export const findChildDirs = ( fileOps: FileOps, ignoreFilters: ( s: string ) => boolean, foundDirFilters: ( s: string ) => Promise<boolean> ) => async ( name: string ): Promise<string[]> => {
  const find = async ( parent: string ): Promise<string[]> => {
    // console.log ( 'found', parent )
    const isDir = await fileOps.isDirectory ( parent )
    if ( !isDir ) return []
    const found = await foundDirFilters ( parent )
    // console.log ( 'found & filtered', parent, found )
    if ( found ) return Promise.resolve ( [ parent ] )
    const children = await fileOps.listFiles ( parent ).then ( list => list.filter ( dir => !ignoreFilters ( dir ) ).map ( addPrefix ( parent ) ) )
    const directories: string[] = await findMatchingK ( children, fileOps.isDirectory )
    let result: string[] = []
    const directoryResults = await Promise.all ( directories.map ( find ) )
    directoryResults.forEach ( found => found.forEach ( f => result.push ( f ) ) )
    return result
  }
  return find ( name )
}
export const findChildDirsUnder = ( fileOps: FileOps, ignoreFilters: ( s: string ) => boolean, foundDirFilters: ( s: string ) => Promise<boolean> ) => async ( name: string ): Promise<string[]> => {
  // console.log('checking', name)
  if ( !await fileOps.isDirectory ( name ) ) return []
  const dirs = await fileOps.listFiles ( name )
  let result: string[] = []
  await Promise.all ( dirs.map ( dir => findChildDirs ( fileOps, ignoreFilters, foundDirFilters ) ( dir ).then ( found => result.push ( ...found ) ) ) )
  return result
}

async function partitionToDirsAndFiles ( fileOps: FileOps, parent: string, list: string[] ) {
  const arrays = await Promise.all<[ string[], string[] ]> ( list.map ( async ( s: string ): Promise<[ string[], string[] ]> => {
      if ( await fileOps.isDirectory ( fileOps.join ( parent, s ) ) ) return [ [ s ], [] ]
      if ( await fileOps.isFile ( fileOps.join ( parent, s ) ) ) return [ [], [ s ] ]
      throw new Error ( `Not a file or directory: ${s}` )
    }
  ) )
  return { dirs: flatMap ( arrays, s => s[ 0 ] ), files: flatMap ( arrays, s => s[ 1 ] ) }
}

export const findChildFiles = ( fileOps: FileOps, ignoreFilters: ( s: string ) => boolean ) => async ( root: string ): Promise<string[]> => {
  const find = async ( path: string[] ): Promise<string[]> => {
    const fullName = fileOps.join ( root, ...path )
    // console.log ( 'root', root, 'fullName', fullName, 'path', path )
    const isFile = await fileOps.isFile ( fullName )
    if ( isFile ) return [ path.join ( '/' ) ]
    const children = await fileOps.listFiles ( fullName ).then ( list => list.filter ( dir => !ignoreFilters ( lastSegment ( dir ) ) )
      .map ( f => [ ...path, lastSegment ( f ) ].join ( '/' ) ) )
    // console.log ( 'children', children )
    const { files, dirs } = await partitionToDirsAndFiles ( fileOps, root, children )
    // console.log ( 'files', files, 'dirs', dirs )
    let filesUnderDirs: string[] = await Promise.all<string[]> ( dirs.map ( dir => find ( [ ...path, lastSegment ( dir ) ] ) ) ).then ( flatten );
    let result: string[] = [ ...files, ...filesUnderDirs ]
    return result
  }
  const result = await find ( [] )
  return result
}
