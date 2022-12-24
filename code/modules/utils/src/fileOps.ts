export interface CopyFileFns {
  loadFileOrUrl: ( fileOrUrl: string ) => Promise<string>
  saveFile ( filename: string, text: string ): Promise<void>
}
export interface FileOps extends CopyFileFns {
  digest ( s: string ): string
  createDir: ( dir: string ) => Promise<string | undefined>
  listFiles ( root: string ): Promise<string[]>
}

export interface MeteredFileOps extends FileOps {
  digestCount (): number
  lastDigested (): string
  loadFileOrUrlCount (): number
  lastLoadedFile (): string

  createDirCount (): number
  lastCreatedDir (): string

  saveFileCount (): number
  lastSavedFileName (): string
  lastSavedFile (): string

  listFilesCount (): number
}
export function cacheStats ( fileOps: FileOps ): any {
  if ( !isMeteredFileOps ( fileOps ) ) return { error: "No cache" }
  const { saveFileCount, loadFileOrUrlCount, createDirCount } = fileOps
  return { saveFileCount: saveFileCount (), loadFileOrUrlCount: loadFileOrUrlCount (), createDirCount: createDirCount () }

}
export function isMeteredFileOps ( fileOps: FileOps ): fileOps is MeteredFileOps {
  const a: any = fileOps
  return a.digestCount !== undefined
}
export function meteredFileOps ( fileOps: FileOps ): MeteredFileOps {
  if ( isMeteredFileOps ( fileOps ) ) return fileOps
  var digestCount: number = 0;
  var lastDigested: string = undefined

  var loadFileOrUrlCount: number = 0;
  var lastLoadedFile: string = undefined
  var createDirCount: number = 0;
  var lastCreatedDir: string = undefined;
  var saveFileCount: number = 0;
  var lastSavedFileName: string = undefined;
  var lastSavedFile: string = undefined;
  var listFilesCount: number = 0
  return {
    ...fileOps,
    createDirCount: () => createDirCount,
    digestCount: () => digestCount,
    lastCreatedDir: () => lastCreatedDir,
    lastSavedFile: () => lastSavedFile,
    lastSavedFileName: () => lastSavedFileName,
    lastDigested: () => lastDigested,
    lastLoadedFile: () => lastLoadedFile,
    loadFileOrUrlCount: () => loadFileOrUrlCount,
    saveFileCount: () => saveFileCount,
    listFilesCount: () => listFilesCount,

    createDir ( dir: string ): Promise<string | undefined> {
      createDirCount += 1
      lastCreatedDir = dir
      return fileOps.createDir ( dir );
    },
    loadFileOrUrl ( fileOrUrl: string ): Promise<string> {
      loadFileOrUrlCount += 1
      lastLoadedFile = fileOrUrl
      return fileOps.loadFileOrUrl ( fileOrUrl )
    },
    digest ( s: string ): string {
      digestCount += 1
      lastDigested = s
      return fileOps.digest ( s );
    },
    listFiles ( root: string ): Promise<string[]> {
      listFilesCount += 1
      return fileOps.listFiles ( root )
    },
    saveFile ( filename: string, text: string ): Promise<void> {
      saveFileCount += 1
      lastSavedFile = text
      lastSavedFileName = filename
      return fileOps.saveFile ( filename, text )
    }
  }
}


export const emptyFileOps: FileOps = {
  createDir (): Promise<string | undefined> {return Promise.resolve ( undefined );},
  loadFileOrUrl (): Promise<string> {return Promise.resolve ( "" );},
  digest (): string {return "";},
  listFiles (): Promise<string[]> {return Promise.resolve ( [] );},
  saveFile (): Promise<void> {return Promise.resolve ();}
}

export function cachedLoad ( fileOps: FileOps, cache: string ): ( fileOrUrl: string ) => Promise<string> {
  if ( cache === undefined ) return fileOps.loadFileOrUrl
  return fileOrUrl => {
    if ( !fileOrUrl.includes ( '://' ) ) return fileOps.loadFileOrUrl ( fileOrUrl )
    const digest = fileOps.digest ( fileOrUrl );
    const cached = cache + '/' + digest
    return fileOps.loadFileOrUrl ( cached ).then ( result => result,
      async () => {
        await fileOps.createDir ( cache )
        const result = await fileOps.loadFileOrUrl ( fileOrUrl )
        return fileOps.saveFile ( cached, result ).then ( () => result )
      } )
  }
}

export interface CachedFileOps extends FileOps {
  cached: true
}

export function isCachedFileOps ( f: FileOps ): f is CachedFileOps {
  const a: any = f
  return a.cached === true
}
export function cachedFileOps ( fileOps: FileOps, cache: string | undefined ): FileOps | CachedFileOps {
  return cache === undefined || isCachedFileOps ( fileOps ) ? fileOps : { ...fileOps, loadFileOrUrl: cachedLoad ( fileOps, cache ), cached: true }
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
