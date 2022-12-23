export interface FileOps {
  // loadFile: ( fileOrUrl: string ) => Promise<string>
  digest ( s: string ): string
  loadFileOrUrl: ( fileOrUrl: string ) => Promise<string>
  createDir: ( dir: string ) => Promise<string | undefined>
  saveFile ( filename: string, text: string ): Promise<void>
  // loadFileSync: ( fileOrUrl: string ) => string
}

export function cachedLoad ( fileOps: FileOps, cache: string ): ( fileOrUrl: string ) => Promise<string> {
  if ( cache === undefined ) return fileOps.loadFileOrUrl
  return fileOrUrl => {
    const digest = fileOps.digest ( fileOrUrl );
    // console.log ( 'cache', cache, 'digest', digest )
    const cached = cache + '/' + digest
    return fileOps.loadFileOrUrl ( cached ).then ( result => result,
      error => fileOps.createDir ( cache ).then ( () => fileOps.loadFileOrUrl ( fileOrUrl ) ).then ( result => fileOps.saveFile ( cached, result ).then ( () => result ) ) )
  }
}


export interface CopyFileDetails {
  url: string
  offset: string
}
export function copyFile ( fileOps: FileOps, root: string ): ( fd: CopyFileDetails ) => Promise<void> {
  return ( { url, offset } ) => fileOps.loadFileOrUrl ( url ).then ( file => fileOps.saveFile ( root + '/' + offset, file ) )
}
export function copyFiles ( fileOps: FileOps, root: string, context: string ): ( fs: CopyFileDetails[] ) => Promise<void> {
  const cf = copyFile ( fileOps, root )
  return fs => Promise.all ( fs.map ( f => cf ( f ).catch ( e => {throw Error ( `${context}\nFile ${f}\n${e}` )} ) ) ).then ( () => {} )
}
