import { CopyFileOptions, FileOps, parseJson, TemplateFileDetails, TransformTextFn } from "./fileOps";
import { deepCombineTwoObjects, foldK, mapK } from "@laoban/utils";
import { findPart } from "@laoban/utils/dist/src/dotLanguage";

export type PostProcessFn = ( context: string, fileOps: FileOps, copyFileOptions: CopyFileOptions, cfd: TemplateFileDetails ) => ( text: string, postProcessCmd: string ) => Promise<string | undefined>
export const postProcessJson: PostProcessFn = ( context ) =>
  async ( text, cmd ) => {if ( cmd === 'json' ) return JSON.stringify ( parseJson ( context ) ( text ), null, 2 )}
export const postProcessCheckEnv: PostProcessFn = ( context ) => async ( text, cmd ) => {
  if ( cmd.match ( /^checkEnv\(.*\)$/ ) ) {
    const env = cmd.slice ( 9, -1 )
    if ( process.env[ env ] === undefined ) console.error ( `${context}\n  requires the env variable [${env}] to exist and it doesn't. This might cause problems` )
    return text
  }
}

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
export const partToMerge = ( context: string, fileOps: FileOps, tx: TransformTextFn | undefined ) => async ( fileCmd: string ): Promise<any> => {
  const fileNameAndOrPart = findFileNameAndOrPart ( fileCmd )
  const fileAsString = await fileOps.loadFileOrUrl ( fileName ( fileNameAndOrPart ) )
  const txed = await (tx ? tx ( '${}', fileAsString ) : fileAsString)
  const fileAsJson = parseJson ( `${context}.jsonMergeInto ${fileCmd}` ) ( txed )
  let result = isFileAndPart ( fileNameAndOrPart ) ? findPart ( fileAsJson, fileNameAndOrPart.part ) : fileAsJson;
  return result
}


export const postProcessJsonMergeInto: PostProcessFn = ( context, fileOps, copyFileOptions, cfd ) => async ( text, cmd ) => {
  const { tx } = copyFileOptions
  if ( cmd.match ( /^jsonMergeInto\(.*\)$/ ) ) {
    const commaSeparatedFiles = cmd.slice ( 14, -1 )
    const files = commaSeparatedFiles.split ( ',' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
    const fileParts = await mapK ( files, partToMerge ( context, fileOps, tx ) )
    const myJson = parseJson<any> ( context ) ( text )
    const result = [ ...fileParts, myJson ].reduce ( deepCombineTwoObjects )
    return JSON.stringify ( result, null, 2 )
  }
}

export function composePostProcessFn ( ...ps: PostProcessFn[] ): PostProcessFn {
  return ( context, fileOps, copyFileOptions, cfd ) => {
    const txsPs: (( text: string, postProcessCmd: string ) => Promise<string | undefined>)[] = ps.map ( p => p ( context, fileOps, copyFileOptions, cfd ) )
    return ( txt, cmd ) => foldK ( txsPs, undefined,
      async ( acc: string | undefined, p: ( text: string, cmd: string ) => Promise<string | undefined> ) => {
        if ( acc ) return acc
        return p ( txt, cmd )
      } )
  }
}

export const defaultPostProcessors = composePostProcessFn ( postProcessJson, postProcessCheckEnv, postProcessJsonMergeInto )