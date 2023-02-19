import { applyOrOriginal, PostProcessor } from "./postProcessor";
import { allButLastSegment, NameAnd, safeArray } from "@laoban/utils";
import { DebugCommands } from "@laoban/debug";
import { FileOps } from "./fileOps";

export type SourceTemplateFileDetailsSingleOrArray = SourcedTemplateFileDetails | SourcedTemplateFileDetails[]

export interface TemplateCoreDetails {
  file?: string
  target?: string
  templated?: string
//@deprecated use templated instead
  type?: string
  postProcess?: string | string[]
  sample?: boolean

  mergeWithParent?: 'jsonMerge'
}
export interface TemplateFileDetails extends TemplateCoreDetails {
  mergeWithParent?: 'jsonMerge'
  directory?: NameAnd<TemplateFileDetails | string>
}

export interface SourcedTemplateFileDetails extends TemplateCoreDetails {
  source?: string[]
  directory?: NameAnd<SourceTemplateFileDetailsSingleOrArray>
}
export type CopyFileDetails = string | TemplateFileDetails
export type TransformTextFn = ( type: string, text: string ) => Promise<string>
export const applyTx = ( tx: TransformTextFn|undefined, type: string) =>async (text: string ): Promise<string> =>
  tx?tx ( type, text ):text;

export function combineTransformFns ( ...fns: TransformTextFn[] ): TransformTextFn {
  return ( type, text ) => {
    if (type==='[object Object]') throw new Error(`type is wrong: it is [object Object]`)
    if (typeof type !== 'string') throw new Error(`type is not a string, it is a  ${typeof type}: ${JSON.stringify(type)}`)
    return fns.reduce <Promise<string>> ( async ( acc, fn ) => fn ( type, await acc ), Promise.resolve ( text ) ); }
}
export interface CopyFileOptions {
  dryrun?: boolean
  tx?: TransformTextFn
  allowSample?: boolean
  postProcessor?: PostProcessor
  lookupForJsonMergeInto?: NameAnd<any>
  filter?: (name: string,  s: SourcedTemplateFileDetails ) => boolean
}
async function postProcess ( context: string, fileOps: FileOps, copyFileOptions: CopyFileOptions, t: CopyFileDetails, text: string ): Promise<string> {
  if ( !isTemplateFileDetails ( t ) ) return text
  const { postProcessor } = copyFileOptions
  if ( !postProcessor ) return text
  const folder = applyOrOriginal ( postProcessor ) ( context, fileOps, copyFileOptions, t );
  return safeArray ( t.postProcess ).reduce ( ( accP: Promise<string>, v ) => {
    return accP.then ( acc => folder ( acc, v ) );
  }, Promise.resolve ( text ) )
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
export async function loadFileFromDetails ( context: string, fileOps: FileOps, rootUrl: string | undefined, options: CopyFileOptions, cfd: string | TemplateFileDetails ) {
  const fileName = await applyTx(options?.tx, '${}')(fileNameFrom ( cfd ));
  const { tx } = options

  const target = targetFrom ( cfd )
  function calcFileName () {
    if ( fileName.includes ( '://' ) || fileName.startsWith ( '@' ) ) return fileName
    if ( rootUrl ) return rootUrl + '/' + fileName;
    throw Error ( `trying to load ${JSON.stringify ( cfd )} without a rootUrl` )
  }
  const fullname = calcFileName ()
  const text = await fileOps.loadFileOrUrl ( fullname )
  const txformed: string = tx && isTemplateFileDetails ( cfd ) ? await tx ( cfd.type, text ) : text
  const postProcessed = await postProcess ( context, fileOps, options, cfd, txformed )
  return { target, postProcessed };
}
export interface CopyFileOptions {
  dryrun?: boolean
  allowSamples?: boolean
  tx?: ( type: string, text: string ) => Promise<string>,
}
export function copyFileAndTransform ( fileOps: FileOps, d: DebugCommands, rootUrl: string, targetRoot: string, options: CopyFileOptions ): ( fd: CopyFileDetails ) => Promise<void> {
  const { dryrun, allowSamples } = options

  return async ( cfd ) => {
    const { target, postProcessed } = await loadFileFromDetails ( `Post processing ${targetRoot}, ${JSON.stringify ( cfd )}`, fileOps, rootUrl, options, cfd );
    if ( isTemplateFileDetails ( cfd ) && cfd.sample ) {
      if ( !allowSamples ) return
      if ( await fileOps.isFile ( targetRoot + '/' + target ) ) return
    }
    if ( dryrun ) {
      console.log ( `dryrun: would copy ${target} to ${targetRoot}/${target}` );
      return
    }
    let filename = fileOps.join ( targetRoot + '/' + target );
    await fileOps.createDir ( allButLastSegment ( filename ) )
    return fileOps.saveFile ( filename, postProcessed );
  }
}
export function copyFile ( fileOps: FileOps, d: DebugCommands, rootUrl: string, target: string, options: CopyFileOptions ): ( fd: CopyFileDetails ) => Promise<void> {
  return copyFileAndTransform ( fileOps, d, rootUrl, target, options )
}
export function copyFiles ( context: string, fileOps: FileOps, d: DebugCommands, rootUrl: string, target: string, options: CopyFileOptions ): ( fs: CopyFileDetails[] ) => Promise<void> {
  const cf = copyFileAndTransform ( fileOps, d, rootUrl, target, options )
  return fs => Promise.all ( fs.map ( f => cf ( f ).catch ( e => {
    console.error ( e );
    throw Error ( `Error ${context}\nFile ${JSON.stringify ( f )}\n${e}` )
  } ) ) ).then ( () => {} )
}
export const copyDirectory = async ( fileOps: FileOps, from: string, to: string ): Promise<void> => {
  if ( await fileOps.isDirectory ( from ) ) {
    await fileOps.createDir ( to )
    const files = await fileOps.listFiles ( from )
    await Promise.all ( files.map ( f => copyDirectory ( fileOps, fileOps.join ( from, f ), fileOps.join ( to, f ) ) ) )
  } else if ( await fileOps.isFile ( from ) )
    await fileOps.saveFile ( to, await fileOps.loadFileOrUrl ( from ) )
};