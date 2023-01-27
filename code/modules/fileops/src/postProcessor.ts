import { CopyFileOptions, FileOps, parseJson, TemplateFileDetails, TransformTextFn } from "./fileOps";
import { deepCombineTwoObjects, foldK, mapK, NameAnd, objectSortedByKeys, safeObject } from "@laoban/utils";
import { findPart } from "@laoban/utils/dist/src/dotLanguage";

type PostProcessFn = ( context: string, fileOps: FileOps, copyFileOptions: CopyFileOptions, cfd: TemplateFileDetails ) => ( text: string, postProcessCmd: string ) => Promise<string>
export interface PostProcessor {
  applicable: ( postProcessCmd: string ) => boolean
  postProcess: ( context: string, fileOps: FileOps, copyFileOptions: CopyFileOptions, cfd: TemplateFileDetails ) => ( text: string, postProcessCmd: string ) => Promise<string>
}

export function postProcessor ( matcher: RegExp, postProcess: PostProcessFn ): PostProcessor {
  return { applicable: ( postProcessCmd: string ) => postProcessCmd.match ( matcher ) !== null, postProcess }
}
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
export const postProcessJsonMergeInto: PostProcessor = postProcessor ( jsonMergeIntoRegEx, ( context, fileOps, copyFileOptions, cfd ) => async ( text, cmd ) => {
  const { tx } = copyFileOptions
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


export const applyOrOriginal = ( p: PostProcessor ) => ( context, fileOps, copyFileOptions, cfd ) => async ( text: string, postProcessCmd: string ) => {
  let applicable = p.applicable ( postProcessCmd );
  return applicable ? p.postProcess ( context, fileOps, copyFileOptions, cfd ) ( text, postProcessCmd ) : text;
}
export const applyOrUndefined = ( p: PostProcessor ) => ( context, fileOps, copyFileOptions, cfd ) => async ( text: string, postProcessCmd: string ) =>
  p.applicable ( postProcessCmd ) ? p.postProcess ( context, fileOps, copyFileOptions, cfd ) ( text, postProcessCmd ) : undefined


export const defaultPostProcessors = chainPostProcessFn ( postProcessJson, postProcessCheckEnv, postProcessJsonMergeInto, jsonSortPostProcess )