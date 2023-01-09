import { DebugCommands } from "@laoban/debug";
import { deepCombineTwoObjects, NameAnd, safeArray } from "@laoban/utils";


export const shortCuts: NameAnd<string> = { laoban: 'https://raw.githubusercontent.com/phil-rice/laoban/master/common' };

export interface CopyFileFns {
  loadFileOrUrl: ( fileOrUrl: string ) => Promise<string>
  saveFile ( filename: string, text: string ): Promise<void>
}
export interface Path {
  join ( ...parts: string[] ): string
}
export const simplePath: Path = { join ( ...parts ): string {return parts.join ( '/' )} }

export interface FileOps extends CopyFileFns, Path {
  digest ( s: string ): string
  createDir: ( dir: string ) => Promise<string | undefined>
  listFiles ( root: string ): Promise<string[]>
  isDirectory ( filename: string ): Promise<boolean>
  isFile ( filename: string ): Promise<boolean>
  removeDirectory ( filename: string, recursive: boolean ): Promise<void>
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


export const parseJson = <T> ( context: string | (() => string) ) => ( s: string ): T => {
  try {
    return JSON.parse ( s )
  } catch ( e ) {
    const realContext = typeof context === 'function' ? context () : context
    throw new Error ( `Invalid JSON for ${realContext}: ${s}` )
  }
};
export function loadWithParents<T> ( context: string, loader: ( url ) => Promise<string>, parse: ( context: string ) => ( json: string, location: string ) => T, findChildrenUrls: ( t: T ) => string[], fold: ( t1: T, t2: T ) => T ): ( url: string ) => Promise<T> {
  return url => loader ( url ).then ( async json => {
    const t: T = parse ( `${context}. Url ${url}` ) ( json, url )
    const parentUrls: string[] = findChildrenUrls ( t );
    const parents = await Promise.all ( parentUrls.map ( loadWithParents ( context, loader, parse, findChildrenUrls, fold ) ) );
    const resultArray = [ ...parents, t ];
    let result = resultArray.reduce ( fold );
    // console.log ( `loadWithParents ${url}  => parents ${parentUrls} => `, parents, ' Result', result )
    return result;
  } )
}


export const emptyFileOps: FileOps = {
  ...simplePath,
  createDir (): Promise<string | undefined> {return Promise.resolve ( undefined );},
  loadFileOrUrl (): Promise<string> {return Promise.resolve ( "" );},
  digest (): string {return "";},
  listFiles (): Promise<string[]> {return Promise.resolve ( [] );},
  saveFile (): Promise<void> {return Promise.resolve ();},
  isDirectory (): Promise<boolean> {return Promise.resolve ( false )},
  isFile: (): Promise<boolean> => {return Promise.resolve ( false )},
  removeDirectory: (): Promise<void> => Promise.resolve (),
}


export function shortCutFileOps ( fileOps: FileOps, nameAndPrefix: NameAnd<string> ): FileOps {
  function processFile ( s: string ): string {
    return s.replace ( /^@([^@]*)@/g, ( full ) => {
      const name = full.slice ( 1, -1 );
      const result = nameAndPrefix[ name ]
      if ( result === undefined )
        throw new Error ( `Cannot handle filename ${s}. It has the @${name}@. Legal names are ${Object.keys ( nameAndPrefix )}` )
      return result
    } )
  }
  return {
    digest: fileOps.digest,
    isFile: ( filename: string ) => fileOps.isFile ( processFile ( filename ) ),
    isDirectory: ( filename: string ) => fileOps.isDirectory ( processFile ( filename ) ),
    removeDirectory: ( filename: string, recursive: boolean ) => fileOps.removeDirectory ( processFile ( filename ), recursive ),
    loadFileOrUrl: ( fileOrUrl ) => fileOps.loadFileOrUrl ( processFile ( fileOrUrl ) ),
    createDir: dir => fileOps.createDir ( processFile ( dir ) ),
    saveFile: ( filename: string, text: string ) => fileOps.saveFile ( processFile ( filename ), text ),
    listFiles: ( root: string ) => fileOps.listFiles ( processFile ( root ) ),
    join: fileOps.join
  }
}

interface TemplateFileDetails {
  file: string
  target?: string
  type: string
  postProcess?: string | string[]
}
const postProcessOne = ( context: string, fileOps: FileOps, tx: ( type: string, text: string ) => Promise<string> ) => async ( text: string, p: string ): Promise<string> => {
  if ( p === 'json' ) try {
    return JSON.stringify ( JSON.parse ( text ), null, 2 )
  } catch ( e ) {
    console.error ( `Cannot parse post processing json ${context}`, e )
    console.error ( 'json is', text )
    throw e
  }
  if ( p.match ( /^checkEnv\(.*\)$/ ) ) {
    const env = p.slice ( 9, -1 )
    if ( process.env[ env ] === undefined ) console.error ( `${context}\n requires the env variable [${env} to exist and it doesn't. This might cause problems]` )
    return text
  }
  if ( p.match ( /^jsonMergeInto\(.*\)$/ ) ) {
    const commaSeparatedFiles = p.slice ( 14, -1 )
    const files = commaSeparatedFiles.split ( ',' )
    const fileJson: string[] = await Promise.all<string> ( files.map ( name =>
      fileOps.loadFileOrUrl ( name ).then ( content => tx ( '${}', content ) ).then ( parseJson ( `${context} file ${name}` ) ) ) )
    const myJson = parseJson<any> ( context ) ( text )
    const result = [ ...fileJson, myJson ].reduce ( deepCombineTwoObjects )
    // console.log('size:', files.length)
    return JSON.stringify ( result, null, 2 )
  }

  throw Error ( `${context}. Don't know how to post process with ${p}. Legal values are 'json' and 'checkEnv(xxx) - which checks the environment variable has a value` )
};
async function postProcess ( context: string, fileOps: FileOps, tx: ( type: string, text: string ) => Promise<string>, t: CopyFileDetails, text: string ): Promise<string> {
  if ( !isTemplateFileDetails ( t ) ) return text
  return safeArray ( t.postProcess ).reduce ( ( accP: Promise<string>, v ) => accP.then ( acc => postProcessOne ( context, fileOps, tx ) ( acc, v ) ), Promise.resolve ( text ) )
}

export function isTemplateFileDetails ( t: CopyFileDetails ): t is TemplateFileDetails {
  const a: any = t
  return a.file !== undefined
}
export function fileNameFrom ( f: CopyFileDetails ): string {
  if ( isTemplateFileDetails ( f ) ) return f.file
  if ( typeof f === 'string' ) return f
  throw new Error ( `Cannot find file name in [${JSON.stringify ( f )}]` )
}
export function targetFrom ( f: CopyFileDetails ): string {
  if ( isTemplateFileDetails ( f ) ) return f.target ? f.target : f.file
  if ( typeof f === 'string' ) return f
  throw new Error ( `Cannot find target in [${JSON.stringify ( f )}]` )
}


export type CopyFileDetails = string | TemplateFileDetails

export async function loadFileFromDetails ( context: string, fileOps: FileOps, rootUrl: string | undefined, tx: ( type: string, text: string ) => Promise<string>, cfd: string | TemplateFileDetails ) {
  const fileName = fileNameFrom ( cfd );
  const target = targetFrom ( cfd )
  function calcFileName () {
    if ( fileName.includes ( '://' ) || fileName.startsWith ( '@' ) ) return fileName
    if ( rootUrl ) return rootUrl + '/' + fileName;
    throw Error ( `trying to load ${JSON.stringify ( cfd )} without a rootUrl` )
  }
  const fullname = calcFileName ()
  const text = await fileOps.loadFileOrUrl ( fullname )
  const txformed: string = tx && isTemplateFileDetails ( cfd ) ? await tx ( cfd.type, text ) : text
  const postProcessed = await postProcess ( context, fileOps, tx, cfd, txformed )
  return { target, postProcessed };
}

export function copyFileAndTransform ( fileOps: FileOps, d: DebugCommands, rootUrl: string, targetRoot: string, tx?: ( type: string, text: string ) => Promise<string>, dryrun?: boolean ): ( fd: CopyFileDetails ) => Promise<void> {
  return async ( cfd ) => {
    const { target, postProcessed } = await loadFileFromDetails ( `Post processing ${targetRoot}, ${JSON.stringify ( cfd )}`, fileOps, rootUrl, tx, cfd );
    if ( dryrun ) {
      console.log ( `dryrun: would copy ${target} to ${targetRoot}/${target}` );
      return
    }
    return fileOps.saveFile ( targetRoot + '/' + target, postProcessed );
  }
}


export function copyFile ( fileOps: FileOps, d: DebugCommands, rootUrl: string, target: string, dryrun?: boolean ): ( fd: CopyFileDetails ) => Promise<void> {
  return copyFileAndTransform ( fileOps, d, rootUrl, target, undefined, dryrun )
}
export function copyFiles ( context: string, fileOps: FileOps, d: DebugCommands, rootUrl: string, target: string, tx?: ( type: string, text: string ) => Promise<string>, dryrun?: boolean ): ( fs: CopyFileDetails[], dryrun?: boolean ) => Promise<void> {
  const cf = copyFileAndTransform ( fileOps, d, rootUrl, target, tx, dryrun )
  return fs => Promise.all ( fs.map ( f => cf ( f ).catch ( e => {
    console.error ( e );
    throw Error ( `Error ${context}\nFile ${JSON.stringify ( f )}\n${e}` )
  } ) ) ).then ( () => {} )
}