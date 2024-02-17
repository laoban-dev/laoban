//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { ErrorsAnd, hasErrors, NameAnd } from "@laoban/utils";


export const shortCuts: NameAnd<string> = { laoban: 'https://raw.githubusercontent.com/phil-rice/laoban/master/common' };

export interface CopyFileFns {
  loadFileOrUrl: ( fileOrUrl: string, headers?: NameAnd<string> ) => Promise<string>
  saveFile ( filename: string, text: string ): Promise<void>
}
export interface LogFileFns {
  log: ( filename: string, text: string ) => Promise<void>
}
export interface Path {
  join ( ...parts: string[] ): string
  relative ( from: string, to: string ): string
}
export const simplePath: Path = {
  join ( ...parts ): string {return parts.join ( '/' )},
  relative ( from: string, to: string ): string {return to} //not relative at all!
}

export type FileAndType = {
  name: string
  isDirectory: () => boolean
  isFile: () => boolean
}
export interface FileOps extends CopyFileFns, Path, LogFileFns {
  digest ( s: string ): string
  createDir: ( dir: string ) => Promise<string | undefined>
  listFiles ( root: string ): Promise<string[]>
  listFileWithType ( root: string ): Promise<FileAndType[]>
  isDirectory ( filename: string ): Promise<boolean>
  isFile ( filename: string ): Promise<boolean>
  removeDirectory ( filename: string, recursive: boolean ): Promise<void>
  removeFile ( filename: string ): Promise<void>
}

export function isUrl ( urlOrFilename: string ) {
  return urlOrFilename.startsWith ( 'http:/' ) || urlOrFilename.includes ( '@' )
}
export function isFilename ( urlOrFilename: string ) {
  return !isUrl ( urlOrFilename )
}
export function addPrefixIfFile ( fileOps: FileOps, prefix: string, fileName: string ) {
  const isFullyQUalified = fileName.includes ( ':' ) || fileName.includes ( '@' )
  const newFileName = isFullyQUalified ? fileName : fileOps.join ( prefix, fileName );
  return newFileName;
}

interface TAndExist<T> {
  t: T
  exists: boolean
}
export const findMatchingKFrom = <T> ( fileName: ( t: T ) => string ) => async ( list: T[], filter: ( s: T ) => Promise<boolean> ): Promise<T[]> => {
  const ps: TAndExist<T>[] = await Promise.all ( list.map ( t => filter ( t ).then ( exists => ({ exists, t }) ) ) )
  return ps.filter ( se => se.exists ).map ( se => se.t )
};
export const findMatchingK: ( list: string[], filter: ( s: string ) => Promise<boolean> ) => Promise<string[]> = findMatchingKFrom<string> ( s => s )


export const parseJson = <T> ( context: string | (() => string), writeToError?: boolean ) => ( s: string ): T => {
  try {
    return JSON.parse ( s )
  } catch ( e ) {
    const realContext = typeof context === 'function' ? context () : context
    const message = `Invalid JSON for ${realContext}: ${s}`;
    if ( writeToError ) console.error ( message )
    throw new Error ( message )
  }
};
export function loadWithParents<T, Res> ( context: string, loader: ( url ) => Promise<string>,
                                          parse: ( context: string ) => ( json: string, location: string ) => ErrorsAnd<T>,
                                          findChildrenUrls: ( t: T ) => string[],
                                          findRes: ( t: T ) => Res,
                                          fold: ( t1: Res, t2: Res ) => Res ): ( url: string ) => Promise<ErrorsAnd<Res>> {
  return url => loader ( url ).then ( async json => {
    const t: ErrorsAnd<T> = parse ( `${context}. Url ${url}` ) ( json, url )
    if ( hasErrors ( t ) ) return t
    const parentUrls: string[] = findChildrenUrls ( t );
    const parents = await Promise.all ( parentUrls.map ( loadWithParents ( context, loader, parse, findChildrenUrls, findRes, fold ) ) );
    const resultArray = [ ...parents, t ].map ( findRes );
    let result = resultArray.reduce ( fold );
    // console.log ( `loadWithParents ${url}  => parents ${parentUrls} => `, parents, ' Result', result )
    return result;
  } ).catch ( e => {
    return [ `${context} Error loading ${url}: ${e}` ]
  } )
}


export const emptyFileOps: FileOps = {
  ...simplePath,
  createDir (): Promise<string | undefined> {return Promise.resolve ( undefined );},
  loadFileOrUrl (): Promise<string> {return Promise.resolve ( "" );},
  digest (): string {return "";},
  listFiles (): Promise<string[]> {return Promise.resolve ( [] );},
  listFileWithType (): Promise<FileAndType[]> {return Promise.resolve ( [] );},
  saveFile (): Promise<void> {return Promise.resolve ();},
  isDirectory (): Promise<boolean> {return Promise.resolve ( false )},
  isFile: (): Promise<boolean> => {return Promise.resolve ( false )},
  removeDirectory: (): Promise<void> => Promise.resolve (),
  removeFile: (): Promise<void> => Promise.resolve (),
  log: () => Promise.resolve ()
}


interface ShortCutFileOps extends FileOps {
  nameAndPrefix: NameAnd<string>
}
export function isShortCutFileOps ( fileOps: FileOps ): fileOps is ShortCutFileOps {
  return (fileOps as ShortCutFileOps).nameAndPrefix !== undefined
}

export function processFileForShortCuts ( nameAndPrefix: NameAnd<string>, s: string ): string {
  return s.replace ( /^@([^@]*)@/g, ( full ) => {
    const name = full.slice ( 1, -1 );
    const result = nameAndPrefix[ name ]
    if ( result === undefined )
      throw new Error ( `Cannot handle filename ${s}. It has the @${name}@. Legal names are ${Object.keys ( nameAndPrefix )}` )
    return result
  } )
}
export function fileNameWithoutShortCuts ( fileOps: FileOps, rawFilename ): string {
  return isShortCutFileOps ( fileOps ) ? processFileForShortCuts ( fileOps.nameAndPrefix, rawFilename ) : rawFilename
}

export function shortCutFileOps ( fileOps: FileOps, nameAndPrefix: NameAnd<string> ): ShortCutFileOps {
  return {
    ...fileOps,
    nameAndPrefix,
    digest: fileOps.digest,
    isFile: ( filename: string ) => fileOps.isFile ( processFileForShortCuts ( nameAndPrefix, filename ) ),
    isDirectory: ( filename: string ) => fileOps.isDirectory ( processFileForShortCuts ( nameAndPrefix, filename ) ),
    removeFile: ( filename: string ) => fileOps.removeFile ( processFileForShortCuts ( nameAndPrefix, filename ) ),
    removeDirectory: ( filename: string, recursive: boolean ) => fileOps.removeDirectory ( processFileForShortCuts ( nameAndPrefix, filename ), recursive ),
    loadFileOrUrl: ( fileOrUrl, headers?: NameAnd<string> ) => fileOps.loadFileOrUrl ( processFileForShortCuts ( nameAndPrefix, fileOrUrl ), headers ),
    createDir: dir => fileOps.createDir ( processFileForShortCuts ( nameAndPrefix, dir ) ),
    saveFile: ( filename: string, text: string ) => fileOps.saveFile ( processFileForShortCuts ( nameAndPrefix, filename ), text ),
    log: ( filename: string, text: string ) => fileOps.log ( processFileForShortCuts ( nameAndPrefix, filename ), text ),
    listFiles: ( root: string ) => fileOps.listFiles ( processFileForShortCuts ( nameAndPrefix, root ) ),
    join: fileOps.join,
    relative: fileOps.relative
  }
}

export function withAuthFileOps ( fileOps: FileOps, token: string ): FileOps {
  return {
    ...fileOps,
    loadFileOrUrl: ( url, headers?: NameAnd<string> ) => {
      const newHeaders: NameAnd<string> = ({ ...headers || {}, Authorization: `Bearer ${token}` })
      return fileOps.loadFileOrUrl ( url, newHeaders )
    }
  }
}

export function cleanUpProjectData(pd: any){
  const result : any = {}
  Object.entries(pd).forEach(([projName, projData]) =>{
    const newProjData : any = {}
    Object.entries(projData).forEach(([repoName, repoValue]) => {
        newProjData[decodeURI(repoName)] = {...repoValue, project: decodeURI(repoValue.project), repo: decodeURI(repoValue.repo)}
    })
    result[decodeURI(projName)] = newProjData
  })
  return result
}


export function withHeaders ( fileOps: FileOps,extraHeaders: NameAnd<string> ): FileOps {
  return {
    ...fileOps,
    loadFileOrUrl: ( url, headers?: NameAnd<string> ) => {
      const newHeaders: NameAnd<string> = ({ ...headers || {}, ...extraHeaders})
      return fileOps.loadFileOrUrl ( url, newHeaders )
    }
  }
}


export interface InDirectoryFileOps extends FileOps {
  directory: string
}
export function isInDirectoryFileOps ( fileOps: FileOps ): fileOps is InDirectoryFileOps {
  return (fileOps as InDirectoryFileOps).directory !== undefined
}

export function inDirectoryFileOps ( fileOps: FileOps, directory: string ): InDirectoryFileOps {
  const processFile = ( s: string ): string =>
    s.startsWith ( '/' ) || s.includes ( ':' ) ? s : fileOps.join ( directory, s );
  if ( isInDirectoryFileOps ( fileOps ) ) return { ...fileOps, directory }
  return {
    ...fileOps,
    directory,
    digest: fileOps.digest,
    isFile: ( filename: string ) => fileOps.isFile ( processFile ( filename ) ),
    isDirectory: ( filename: string ) => fileOps.isDirectory ( processFile ( filename ) ),
    removeFile: ( filename: string ) => fileOps.removeFile ( processFile ( filename ) ),
    removeDirectory: ( filename: string, recursive: boolean ) => fileOps.removeDirectory ( processFile ( filename ), recursive ),
    loadFileOrUrl: ( fileOrUrl, headers?: NameAnd<string> ) => fileOps.loadFileOrUrl ( processFile ( fileOrUrl ), headers ),
    createDir: dir => fileOps.createDir ( processFile ( dir ) ),
    saveFile: ( filename: string, text: string ) => fileOps.saveFile ( processFile ( filename ), text ),
    log: ( filename: string, text: string ) => fileOps.log ( processFile ( filename ), text ),
    listFiles: ( root: string ) => fileOps.listFiles ( processFile ( root ) ),
    join: fileOps.join,
    relative: fileOps.relative
  }
}


