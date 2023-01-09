//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { FileOps } from "./fileOps";

export function cachedLoad ( fileOps: FileOps, cache: string, ops: PrivateCacheFileOps ): ( fileOrUrl: string ) => Promise<string> {
  if ( cache === undefined ) return fileOps.loadFileOrUrl
  return fileOrUrl => {
    if ( !fileOrUrl.includes ( '://' ) ) return fileOps.loadFileOrUrl ( fileOrUrl )
    const digest = fileOps.digest ( fileOrUrl );
    const cached = cache + '/' + digest
    return fileOps.loadFileOrUrl ( cached ).then ( result => {
        ops.cacheHit ();
        return result;
      },
      async () => {
        ops.cacheMiss ()
        await fileOps.createDir ( cache )
        const result = await fileOps.loadFileOrUrl ( fileOrUrl )
        return fileOps.saveFile ( cached, result ).then ( () => result )
      } )
  }
}
export interface CachedFileOps extends FileOps {
  original: FileOps
  cacheDir: string
  cached: true
  cacheHits (): number,
  cacheMisses (): number
}
export interface PrivateCacheFileOps {
  cacheHit (),
  cacheMiss ()
}
export function nonCached ( f: FileOps ): FileOps {
  return isCachedFileOps ( f ) ? f.original : f
}
export function isCachedFileOps ( f: FileOps ): f is CachedFileOps {
  const a: any = f
  return a.cached === true
}
function create ( fileOps: FileOps, original: FileOps, cacheDir: string ) {
  let cacheHits = isCachedFileOps ( fileOps ) ? fileOps.cacheHits () : 0
  let cacheMisses = isCachedFileOps ( fileOps ) ? fileOps.cacheMisses () : 0
  const ops: PrivateCacheFileOps = { cacheHit: () => cacheHits += 1, cacheMiss: () => cacheMisses += 1 }
  return {
    ...fileOps, loadFileOrUrl: cachedLoad ( fileOps, cacheDir, ops ),
    cached: true, cacheMisses: () => cacheMisses, cacheHits: () => cacheHits, original, cacheDir
  }
}
export function cachedFileOps ( fileOps: FileOps, cacheDir: string | undefined ): FileOps | CachedFileOps {
  if ( cacheDir === undefined ) return fileOps
  if ( isCachedFileOps ( fileOps ) ) return fileOps.cacheDir === cacheDir ? fileOps : create ( fileOps, fileOps.original, cacheDir );
  return create ( fileOps, fileOps, cacheDir );
}