import { addPrefix, fileContentAndLocation, fileContentAndLocations, FileOps, findChildDirs, findChildDirsUnder, parseJson } from "@laoban/utils";
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
  let result: string[] = []
  stringArrayArray.forEach ( list => result.push ( ...list ) )
  return result
}
export const packageJsonAndLocation = fileContentAndLocation ( 'package.json', parseJson )
export const packageJsonAndLocations = fileContentAndLocations ( 'package.json', parseJson )

export const laobanJsonAndLocation = fileContentAndLocation ( 'laoban.json', parseJson )
export const laobanJsonAndLocations = fileContentAndLocations ( 'laoban.json', parseJson )

export const packageJsonHasWorkspaces = ( json: any ): boolean => json.workspaces && json.workspaces.length > 0