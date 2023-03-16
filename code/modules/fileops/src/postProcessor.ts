import { FileOps, parseJson } from "./fileOps";
import { deepCombineTwoObjects, foldK, mapK, NameAnd, objectSortedByKeys, safeObject, toArray } from "@laoban/utils";
import { findPart } from "@laoban/utils";
import { CopyFileOptions, TemplateFileDetails, TransformTextFn } from "./copyFiles";
import { Xml } from "@laoban/xml";

export interface FileOpsAndXml {
  fileOps: FileOps,
  xml?: Xml
}
type PostProcessFn = ( context: string, fileOpsAndXml: FileOpsAndXml, copyFileOptions: CopyFileOptions, cfd: TemplateFileDetails ) => ( text: string, postProcessCmd: string ) => Promise<string>
export interface PostProcessor {
  applicable: ( postProcessCmd: string ) => boolean
  postProcess: ( context: string, fileOpsAndXml: FileOpsAndXml, copyFileOptions: CopyFileOptions, cfd: TemplateFileDetails ) => ( text: string, postProcessCmd: string ) => Promise<string>
}

export function postProcessor ( matcher: RegExp, postProcess: PostProcessFn ): PostProcessor {
  return { applicable: ( postProcessCmd: string ) => postProcessCmd.match ( matcher ) !== null, postProcess }
}
export const postProcessorForTest: PostProcessor = postProcessor ( /.*/, ( context ) => async ( text, cmd ) =>
  text.includes ( '{' )
    ? text.replace ( /{/, `{"post": "${cmd}",` )
    : `${cmd}(${text})` )

export const postProcessJson: PostProcessor = postProcessor ( /^json$/,
  ( context ) => async ( text, cmd ) => {return JSON.stringify ( parseJson ( context ) ( text ), null, 2 )} )
export const postProcessCheckEnv: PostProcessor = postProcessor ( /^checkEnv\(.*\)$/, ( context ) => async ( text, cmd ) => {
  const env = cmd.slice ( 9, -1 )
  if ( process.env[ env ] === undefined ) console.error ( `${context}\n  requires the env variable [${env}] to exist and it doesn't. This might cause problems` )
  return text
} )

interface FileAndPart {
  file: string
  part: string
}
type FileNameAndOrPart = string | FileAndPart
function isFileAndPart ( f: FileNameAndOrPart ): f is FileAndPart {
  return typeof f === 'object'
}
function findFileNameAndOrPart ( f: string ): FileNameAndOrPart {
  const cmdMatch = f.match ( /^([^#]+)#(.*)$/ )
  return cmdMatch ? { file: cmdMatch[ 1 ], part: cmdMatch[ 2 ] } : f;
}
function fileName ( f: FileNameAndOrPart ): string {
  return isFileAndPart ( f ) ? f.file : f
}
export const partToMerge = ( context: string, fileOps: FileOps, tx: TransformTextFn | undefined, dic: NameAnd<any> ) => async ( fileCmd: string ): Promise<any> => {
  if ( typeof fileCmd === 'string' && fileCmd.startsWith ( '$' ) )
    return safeObject ( findPart ( dic, fileCmd.slice ( 1 ) ) )
  const fileNameAndOrPart = findFileNameAndOrPart ( fileCmd )
  const fileAsString = await fileOps.loadFileOrUrl ( fileName ( fileNameAndOrPart ) )
  const txed = await (tx ? tx ( '${}', fileAsString ) : fileAsString)
  const fileAsJson = parseJson ( `${context}.jsonMergeInto ${fileCmd}` ) ( txed )
  let result = isFileAndPart ( fileNameAndOrPart ) ? findPart ( fileAsJson, fileNameAndOrPart.part ) : fileAsJson;
  return result
}


const jsonMergeIntoRegEx = /^jsonMergeInto\(.*\)$/;
export const postProcessJsonMergeInto: PostProcessor = postProcessor ( jsonMergeIntoRegEx, ( context, fileOpsAndXml, copyFileOptions, cfd ) => async ( text, cmd ) => {
  const { tx } = copyFileOptions
  const { fileOps } = fileOpsAndXml
  if ( cmd.match ( jsonMergeIntoRegEx ) ) {
    const commaSeparatedFiles = cmd.slice ( 14, -1 )
    const files = commaSeparatedFiles.split ( ',' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
    const fileParts = await mapK ( files, partToMerge ( context, fileOps, tx, safeObject ( copyFileOptions?.lookupForJsonMergeInto ) ) )
    const myJson = parseJson<any> ( context ) ( text )
    const result = [ ...fileParts, myJson ].reduce ( deepCombineTwoObjects )
    return JSON.stringify ( result, null, 2 )
  } else throw Error ( `postProcessJsonMergeInto: ${cmd} doesn't match the expected format - software error` )
} )

export const jsonSortPostProcess: PostProcessor = postProcessor ( /jsonSort/, ( context ) => async ( text, cmd ) => {

  const json = parseJson<NameAnd<any>> ( context + '.jsonSort' ) ( text )
  const sorted = objectSortedByKeys ( json )
  return JSON.stringify ( sorted, null, 2 )
} )

const xmlMergeIntoRegEx = /^xmlMergeInto\(.*\)$/;
export const xmlMergeInto: PostProcessor = postProcessor ( xmlMergeIntoRegEx,
  ( context, fileOpsAndXml, copyFileOptions, cfd ) => {
    const { xml } = fileOpsAndXml
    if ( xml === undefined ) throw Error ( `xmlMergeInto: xml is undefined - software error` )
    return async ( text, cmd ) => {
      try {
        const paths = cmd.slice ( 13, -1 ).split ( ',' ).map ( s => s.trim ().slice ( 1 ) ).filter ( s => s.length > 0 )

        // console.log('xmlMergeInto', paths, JSON.stringify(copyFileOptions?.lookupForJsonMergeInto.packageDetails,null,2) )
        const toMerge = paths.map ( p => safeObject ( findPart ( copyFileOptions?.lookupForJsonMergeInto, p ) ) )
        // console.log ( 'xmlMergeInto', cmd, paths )
        // console.log ( 'toMerge', JSON.stringify(toMerge) )

        const xmlDom = xml.parse ( text, cfd.xmlArrays )
        const merged = [ xmlDom, ...toMerge ].reduce ( deepCombineTwoObjects )
        return xml.print ( merged )
      } catch ( e ) {
        console.error ( `Error parsing ${context} as xml` )
        console.error ( e )
        return text
      }
    }
  } )

export function chainPostProcessFn ( ...ps: PostProcessor[] ): PostProcessor {
  return {
    applicable: ( postProcessCmd: string ) => ps.some ( p => p.applicable ( postProcessCmd ) ),
    postProcess: ( context, fileOps, copyFileOptions, cfd ) => {
      return ( txt, cmd ) => {
        const found = ps.find ( p => p.applicable ( cmd ) )
        if ( found ) return found.postProcess ( context, fileOps, copyFileOptions, cfd ) ( txt, cmd )
        throw Error ( `No post processor found for ${cmd} - software error` )
      }
    }
  }
}

export function doAllPostProcessor ( matcher: RegExp, p: PostProcessor, cmds: ( cmd: string ) => string[] ): PostProcessor {
  return postProcessor ( matcher,
    ( context, fileOps, copyFileOptions, cfd ) => async ( text, postProcessCmd: string ) => {
      let commands = cmds ( postProcessCmd );
      let fn = applyOrOriginal ( p ) ( context, fileOps, copyFileOptions, cfd );
      return foldK ( commands, text, async ( t, cmd ) => await fn ( t, cmd ) );
    } )
}


export const applyOrOriginal = ( p: PostProcessor | undefined ) => ( context, fileOps: FileOpsAndXml, copyFileOptions, cfd ) => async ( text: string, postProcessCmd: string ) => {
  if ( !p ) return text;
  let applicable = p.applicable ( postProcessCmd );
  const result = applicable ? await p.postProcess ( context, fileOps, copyFileOptions, cfd ) ( text, postProcessCmd ) : text;
  return result;
}
export const applyOrUndefined = ( p: PostProcessor ) => ( context, fileOps, copyFileOptions, cfd ) => async ( text: string, postProcessCmd: string ) =>
  p.applicable ( postProcessCmd ) ? p.postProcess ( context, fileOps, copyFileOptions, cfd ) ( text, postProcessCmd ) : undefined

export const applyAll = ( p: PostProcessor | undefined ) => ( context, fileOps, copyFileOptions, cfd ) => async ( text: string, postProcessCmd: undefined | string | string[] ) =>
  p
    ? foldK ( toArray ( postProcessCmd ), text, async ( t, cmd ) => applyOrOriginal ( p ) ( context, fileOps, copyFileOptions, cfd ) ( t, cmd ) )
    : text

export const defaultPostProcessors = chainPostProcessFn ( postProcessJson, postProcessCheckEnv, postProcessJsonMergeInto, jsonSortPostProcess, xmlMergeInto )