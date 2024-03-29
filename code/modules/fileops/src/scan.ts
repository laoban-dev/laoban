import { FileOps } from "./fileOps";

export type IgnoreFilter = ( directory: string ) => boolean;
export function defaultIgnoreFilter ( directory: string ): boolean {
  return directory.includes ( 'node_modules' ) || directory.includes ( '.git' ) || directory.includes ( 'target' )
}

export const scanDirectory = ( fileOps: FileOps, ignoreFilter: IgnoreFilter ) => async ( currentDirectory: string, findFilter: ( s: string ) => boolean ): Promise<string[]> => {
  let results: string[] = [];
  try {
    const files = await fileOps.listFileWithType ( currentDirectory );

    for ( const file of files ) {
      const fullPath = fileOps.join ( currentDirectory, file.name );
      if ( file.isDirectory () ) {
        if ( !ignoreFilter ( fullPath ) ) {
          // Recursively scan the subdirectory and combine the results
          const subdirectoryResults = await scanDirectory ( fileOps, ignoreFilter ) ( fullPath, findFilter );
          results = results.concat ( subdirectoryResults );
        }
      } else if ( findFilter ( fullPath ) ) results.push ( fullPath );
    }
  } catch ( err ) {
    throw new Error ( `Error reading directory ${currentDirectory}: ${err.message}` );
  }

  return results;
};