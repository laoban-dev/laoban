export interface FileOps {
  digest ( s: string ): string
  loadFileOrUrl: ( fileOrUrl: string ) => Promise<string>
  createDir: ( dir: string ) => Promise<string | undefined>
  saveFile ( filename: string, text: string ): Promise<void>
}

export function cachedLoad ( fileOps: FileOps, cache: string ): ( fileOrUrl: string ) => Promise<string> {
  if ( cache === undefined ) return fileOps.loadFileOrUrl
  return fileOrUrl => {
    if ( !fileOrUrl.includes ( '://' ) ) return fileOps.loadFileOrUrl ( fileOrUrl )
    const digest = fileOps.digest ( fileOrUrl );
    const cached = cache + '/' + digest
    return fileOps.loadFileOrUrl ( cached ).then ( result => result,
      error => fileOps.createDir ( cache ).then ( () => fileOps.loadFileOrUrl ( fileOrUrl ) ).then ( result => fileOps.saveFile ( cached, result ).then ( () => result ) ) )
  }
}


export type CopyFileDetails = string
export function copyFile ( fileOps: FileOps, rootUrl: string, target: string ): ( fd: CopyFileDetails ) => Promise<void> {
  return ( offset ) => fileOps.loadFileOrUrl ( rootUrl + '/' + offset )
    .then ( file => fileOps.saveFile ( target + '/' + offset, file ) )
}
export function copyFiles ( context: string, fileOps: FileOps, rootUrl: string, target: string ): ( fs: CopyFileDetails[] ) => Promise<void> {
  const cf = copyFile ( fileOps, rootUrl, target )
  return fs => Promise.all ( fs.map ( f => cf ( f ).catch ( e => {
      console.error ( e );
      throw Error ( `Error ${context}\nFile ${f}\n${e}` )
    } ) ) ).then ( () => {} )
}
