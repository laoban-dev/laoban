//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import path from "path";
import { addPrefix, fileContentAndLocation, fileContentAndLocations, FileOps, findChildDirs, findChildDirsUnder, parseJson } from "@laoban/fileops";

export const gitLocation = async ( fileOps: FileOps, directory: string ): Promise<string | undefined> => {
  const gitDir = path.join ( directory, '.git' );
  if ( await fileOps.isDirectory ( gitDir ) ) return directory;
  const parentDir = path.dirname ( directory );
  if ( parentDir === directory ) return undefined;
  return gitLocation ( fileOps, parentDir );
}

export const ignoreDirectories = n => n === 'node_modules' || n.startsWith ( '.' ) || n === 'target';

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