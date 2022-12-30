import { FileOps, findChildDirs } from "@phil-rice/utils";
import path from "path";

const ignoreDirectories = n => n === 'node_modules' || n === '.git' || n === 'target';

export const gitLocations = async ( fileOps: FileOps, directory: string ): Promise<string[]> =>
  findChildDirs ( fileOps, ignoreDirectories, n => fileOps.isDirectory ( path.join ( n, '.git' ) ) ) ( directory );

export const packageJsonLocations = async ( fileOps: FileOps, directory: string ): Promise<string[]> =>
  findChildDirs ( fileOps, ignoreDirectories, n => fileOps.isFile ( path.join ( n, 'package.json' ) ) ) ( directory );

export const packageJsonHasWorkspaces = ( json: any ): boolean => json.workspaces && json.workspaces.length > 0

export function status ( fileOps: FileOps, directory: string ) {
  console.log ( 'Git Directories' )
  return gitLocations ( fileOps, directory ).then ( locs => locs.forEach ( loc => console.log ( '  ', loc ) ) )
}