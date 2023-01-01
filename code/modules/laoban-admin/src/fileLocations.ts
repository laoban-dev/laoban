import { addPrefix, FileOps, findChildDirs, findChildDirsUnder, parseJson } from "@phil-rice/utils";
import path from "path";

export const gitLocation = async ( fileOps: FileOps, directory: string ): Promise<string | undefined> => {
  const gitDir = path.join ( directory, '.git' );
  if ( await fileOps.isDirectory ( gitDir ) ) return directory;
  const parentDir = path.dirname ( directory );
  if ( parentDir === directory ) return undefined;
  return gitLocation ( fileOps, parentDir );
}

const ignoreDirectories = n => n === 'node_modules' || n.startsWith ( '.' ) || n === 'target';

export const gitLocationsUnderHere = async ( fileOps: FileOps, directory: string ): Promise<string[]> =>
  findChildDirs ( fileOps, ignoreDirectories, n => fileOps.isDirectory ( path.join ( n, '.git' ) ) ) ( directory );

export const packageJsonLocations = async ( fileOps: FileOps, directory: string ): Promise<string[]> =>
  findChildDirs ( fileOps, ignoreDirectories, n => fileOps.isFile ( path.join ( n, 'package.json' ) ) ) ( directory );

export const laobanJsonLocations = async ( fileOps: FileOps, directory: string ): Promise<string[]> =>
  findChildDirsUnder ( fileOps, ignoreDirectories, n => fileOps.isFile ( path.join ( n, 'laoban.json' ) ) ) ( directory );


export const packageJsonLocationsUnder = async ( fileOps: FileOps, directory: string ): Promise<string[]> => {
  const rawChildren = await fileOps.listFiles ( directory )
  const children: string[] = rawChildren.filter ( dir => !ignoreDirectories ( dir ) ).map ( addPrefix ( directory ) );
  const stringArrayArray: string[][] = await Promise.all<string[]> ( children.map ( findChildDirs ( fileOps, ignoreDirectories, n => fileOps.isFile ( path.join ( n, 'package.json' ) ) ) ) )
  return stringArrayArray.flat ()
}
export interface LocationAndErrors {
  location: string
  raw: string
  errors: string[]
}
export const isLocationAndErrors = <T> ( x: LocationAndContents<T> ): x is LocationAndErrors => {
  const a: any = x
  return a && a.location && a.raw && a.errors
}
export interface LocationAnd<T> {
  location: string
  directory: string
  contents: T
}
export const isLocationAnd = <T> ( x: LocationAndContents<T> ): x is LocationAnd<T> => {
  const a: any = x
  return a && a.location && a.contents
}
export type LocationAndContents<T> = LocationAnd<T> | LocationAndErrors

export const fileContentAndLocation = <T> ( file: string, parser: ( s: string ) => T ) => async ( fileOps: FileOps, directory: string ): Promise<LocationAndContents<T>> => {
  let location: string = path.join ( directory, file );
  const raw = await fileOps.loadFileOrUrl ( location )
  try {
    const contents = parser ( raw )
    return { location, contents, directory }
  } catch ( error ) {
    return { location, raw, errors: [ `Èrror parsing` ] }
  }
}


export const fileContentAndLocations = <T> ( file: string, parser: ( context: string ) => ( s: string ) => T ) => async ( context: string, fileOps: FileOps, directories: string[] ): Promise<LocationAndContents<T>[]> => {
  return Promise.all ( directories.map ( d => fileContentAndLocation ( file, parser ( `${context} ${d}` ) ) ( fileOps, d ) ) )
}

export const packageJsonAndLocation = fileContentAndLocation ( 'package.json', parseJson )
export const packageJsonAndLocations = fileContentAndLocations ( 'package.json', parseJson )

export const laobanJsonAndLocation = fileContentAndLocation ( 'laoban.json', parseJson )
export const laobanJsonAndLocations = fileContentAndLocations ( 'laoban.json', parseJson )

export const packageJsonHasWorkspaces = ( json: any ): boolean => json.workspaces && json.workspaces.length > 0