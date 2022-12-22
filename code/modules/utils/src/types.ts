

export interface FileOps {
  // loadFile: ( fileOrUrl: string ) => Promise<string>
  digest ( s: string ): string
  loadFileOrUrl: ( fileOrUrl: string ) => Promise<string>
  createDir: ( dir: string ) => Promise<string|undefined>
  saveFile ( filename: string, text: string ): Promise<void>
  // loadFileSync: ( fileOrUrl: string ) => string
}

export function cachedLoad ( fileOps: FileOps, cache: string ): ( fileOrUrl: string ) => Promise<string> {
  if ( cache === undefined ) return fileOps.loadFileOrUrl
  return fileOrUrl => {
    const digest = fileOps.digest ( fileOrUrl );
    // console.log ( 'cache', cache, 'digest', digest )
    const cached =  cache + '/'+ digest
    return fileOps.loadFileOrUrl ( cached ).then ( result => result,
      error => fileOps.createDir ( cache ).then ( () => fileOps.loadFileOrUrl ( fileOrUrl ) ).then ( result => fileOps.saveFile ( cached, result ).then ( () => result ) ) )
  }
}