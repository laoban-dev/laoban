import { FileOps, isUrl, loadWithParents, parseJson, Path } from "./fileOps";
import { CopyFileDetails, CopyFileOptions, SourcedTemplateFileDetails, SourceTemplateFileDetailsSingleOrArray, TemplateFileDetails, TransformTextFn } from "./copyFiles";
import { Validate } from "@laoban/validation";
import { allButLastSegment, combineTwoObjects, deepCombineTwoObjects, errors, ErrorsAnd, flatMap, flatMapK, hasErrors, mapErrors, mapErrorsK, mapK, mapObject, mapObjectK, mapObjectKeys, NameAnd, removeEmptyArrays, toArray } from "@laoban/utils";
import { deletePath } from "@laoban/utils/dist/src/dotLanguage";
import { applyAll } from "./postProcessor";

export interface TemplateControlFile {
  files: NameAnd<CopyFileDetails>
  defaultSrcPrefix?: string,
  deleteFromParents?: string | string[]
  parents?: string | string[]
}
export interface TemplateFileIntermediate {
  files: NameAnd<SourceTemplateFileDetailsSingleOrArray>
  deleteFromParents?: string | string[]
}

function validateCopyFileDetails ( v: Validate<CopyFileDetails>, reason?: string ) {
  if ( v.isString ) return
  const a: Validate<TemplateFileDetails> = v as Validate<TemplateFileDetails>
  const isOptString = a.optIs ( 'string' )
  isOptString ( 'file' )
  isOptString ( 'templated' )
  isOptString ( 'sample' )
  isOptString ( 'target' )

}
function validateTemplateControlFile ( v: Validate<TemplateControlFile> ): Validate<TemplateControlFile> {
  v.isObjectofObjects ( 'files', validateCopyFileDetails )
  return v
}

const findChildren = ( t: TemplateControlFile ): string[] => {
  let parents = toArray ( t.parents )
  return parents;
};
const merge = ( t1: TemplateFileIntermediate, t2: TemplateFileIntermediate ) => {
  function mergeFiles ( f1: NameAnd<SourceTemplateFileDetailsSingleOrArray>, f2: NameAnd<SourceTemplateFileDetailsSingleOrArray> ): NameAnd<SourceTemplateFileDetailsSingleOrArray> {
    const raw = combineTwoObjects ( f1, f2 )
    return mapObjectKeys ( raw, key => {
      const v1: SourceTemplateFileDetailsSingleOrArray = f1[ key ]
      const v2 = f2[ key ]
      if ( v1 === undefined ) return v2
      if ( v2 === undefined ) return v1
      //what about directories...how to merge those?
      let result = toArray ( v1 ).concat ( toArray ( v2 ) );
      const directories = result.filter ( t => t.directory )
      const files = result.filter ( t => !t.directory )
      if ( directories.length > 0 && files.length > 0 ) throw new Error ( `Cannot merge files and directories: ${key}` )
      if ( files.length > 0 ) return result
      let directory: SourcedTemplateFileDetails = directories.reduce ( ( l, r ) => mergeFiles ( l.directory, r.directory ) );
      const sample = directories.filter ( d => d.sample ).map ( d => d.sample ).some ( s => s ) ? true : undefined;
      const source = flatMap ( directories, d => toArray ( d.source ) )
      let dirResult: any = { directory: directory, sample, source };
      return dirResult
      // return directory
    } )
  }
  const files = mergeFiles ( t1.files, t2.files );
  toArray ( t2.deleteFromParents ).forEach ( deletePath ( files ) )
  return { files }

};

const parse = ( path: Path ) => ( context: string ) => {
  const rawParse = parseJson<TemplateControlFile> ( context );
  return ( json: string, location: string ): ErrorsAnd<TemplateControlFile> => {
    let rawJson = rawParse ( json );
    const v = new Validate ( context, rawJson, [], false )
    validateTemplateControlFile ( v )
    if ( v.errors.length > 0 ) return [ `Invalid template control file ${location}: ${v.errors.join ( ', ' )}` ]
    let files = rawJson.files;
    const defaultDir = rawJson.defaultSrcPrefix ? rawJson.defaultSrcPrefix : location;
    function mapCopyFileDetails ( files: NameAnd<SourcedTemplateFileDetails | CopyFileDetails> ) {
      let result = mapObject ( files, ( value, name ) => {

        const mappedValue: any = typeof value === 'string' ? { file: name, source: location } : { ...value, source: location }
        function addPrefix ( name: string ) {
          if ( isUrl ( name ) ) return name
          if ( name.startsWith ( './' ) ) return path.join ( location, name.slice ( 2 ) )
          return path.join ( defaultDir, name )
        }
        if ( mappedValue.directory ) {
          mappedValue.directory = mapCopyFileDetails ( mappedValue.directory )
        } else
          mappedValue.file = addPrefix ( mappedValue.file ? mappedValue.file : name )
        mappedValue.source = [ location ]
        return mappedValue;
      } );
      return result;
    }
    let result = mapCopyFileDetails ( files );
    return { ...rawJson, files: result }
  }
}

const loadFile = ( fileOps: FileOps ) => filename => fileOps.loadFileOrUrl ( fileOps.join ( filename, '.template.json' ) );


export const loadTemplateControlFile = ( context: string, fileOps: FileOps ): ( filename: string ) => Promise<ErrorsAnd<TemplateFileIntermediate>> =>
  loadWithParents<TemplateControlFile, TemplateFileIntermediate> ( context, loadFile ( fileOps ), parse ( fileOps ), findChildren, x => x as TemplateFileIntermediate, merge )


export interface SourcedTemplateFileDetailsWithContent extends SourcedTemplateFileDetails {
  name: string
  content: undefined | string | NameAnd<SourcedTemplateFileDetailsWithContent | SourcedTemplateFileDetailsWithContent[]>
}
export async function loadFilesInTemplate ( fileData: NameAnd<SourceTemplateFileDetailsSingleOrArray>, fileOps: FileOps, options: CopyFileOptions ): Promise<NameAnd<SourcedTemplateFileDetailsWithContent[]>> {
  async function load ( prefix: string[], fileData: NameAnd<SourceTemplateFileDetailsSingleOrArray> ) {
    const realtx: TransformTextFn = async ( type, text ) => options?.tx ? options.tx ( type, text ) : text

    const toMerge: NameAnd<SourcedTemplateFileDetailsWithContent[]> = removeEmptyArrays ( await mapObjectK ( fileData, async ( fas, name ) => {
      return flatMapK ( toArray ( fas ), async fa => {
        const target = [ ...prefix, fa.target ? fa.target : name ].join ( '/' );
        if ( fa.directory ) {return [ { ...fa, name, target, content: await load ( [ ...prefix, name ], fa.directory ) } ]}
        if ( options?.filter && !options.filter ( name, fa ) ) return []
        return [ fa.sample && options?.allowSamples !== true
          ? { ...fa, name, content: undefined }
          : {
            ...fa, name, target, content: await fileOps.loadFileOrUrl ( fa.file ).then ( async text =>
              fa.templated ? await realtx ( fa.templated, text ) : text )
          } ]
      } );
    } ) )
    return toMerge;
  }
  const toMerge = await load ( [], fileData );
  return toMerge;
}

const jsonMerge = ( context: string, left: SourcedTemplateFileDetailsWithContent, right: SourcedTemplateFileDetailsWithContent ): SourcedTemplateFileDetailsWithContent => {
  const realContext = `${context} jsonMerge(${left.file} ${right.file})`;
  const parse = parseJson<any> ( realContext )
  const source = left.source.concat ( right.source )
  if ( left.content === undefined ) return { ...right, source } //sample
  if ( right.content === undefined ) return { ...left, source } //sample
  if ( typeof (left.content) !== 'string' ) throw Error ( `${realContext} Error in template. Trying to merge a directory!` )
  if ( typeof (right.content) !== 'string' ) throw Error ( `${realContext} Error in template. Trying to merge a directory!` )
  const leftJson = parse ( left.content )
  const rightJson = parse ( right.content )
  const combinedJson = deepCombineTwoObjects ( leftJson, rightJson );
  const content = JSON.stringify ( combinedJson, null, 2 );
  return { ...right, content, source }
};

const foldDetailsWithContent = ( context: string ) => ( left: SourcedTemplateFileDetailsWithContent, right: SourcedTemplateFileDetailsWithContent ): SourcedTemplateFileDetailsWithContent => {
  if ( right.mergeWithParent === 'jsonMerge' ) return jsonMerge ( context, left, right )
  return { ...right, source: left.source.concat ( right.source ) }
};
export const mergeFiles = ( context: string ) => ( fileData: NameAnd<SourcedTemplateFileDetailsWithContent[]> ): NameAnd<SourcedTemplateFileDetailsWithContent> => {
  const merged: ErrorsAnd<NameAnd<SourcedTemplateFileDetailsWithContent>> = mapObject ( fileData, ( facs ) => {
    const raw: SourcedTemplateFileDetailsWithContent = facs.reduce ( foldDetailsWithContent ( context ) );
    if ( raw.directory ) {
      const merged = mergeFiles ( context ) ( raw.content as NameAnd<SourcedTemplateFileDetailsWithContent[]> )
      return { ...raw, content: merged }
    }

    return raw;
  } )
  return merged;
};

export const postProcessFiles = ( context: string, fileOps: FileOps, options: CopyFileOptions ) => async ( files: NameAnd<SourcedTemplateFileDetailsWithContent> ): Promise<NameAnd<SourcedTemplateFileDetailsWithContent>> => {
  const result = await mapObjectK ( files, async ( fac, name ) => {
    if ( fac.directory )
      return { ...fac, content: await postProcessFiles ( context, fileOps, options ) ( fac.content as NameAnd<SourcedTemplateFileDetailsWithContent> ) }
    if ( typeof fac.content === 'string' ) {
      const content = await applyAll ( options?.postProcessor ) ( context, fileOps, options, fac ) ( fac.content, fac.postProcess );
      return { ...fac, content }
    }
    return fac
  } );
  return result
};

export async function saveOneTemplateFile ( context: string, fileOps: FileOps, options: CopyFileOptions, targetRoot: string, s: SourcedTemplateFileDetailsWithContent ) {
  const { allowSamples, dryrun, postProcessor } = options
  const { content, target } = s
  if ( typeof content === 'object' ) return saveMergedFiles ( context, fileOps, options, targetRoot, content )
  if ( s.sample ) {
    if ( !allowSamples ) return
    if ( await fileOps.isFile ( targetRoot + '/' + target ) ) return
  }
  if ( dryrun ) {
    console.log ( `dryrun: would copy ${target} to ${targetRoot}/${target}` );
    return
  }
  let filename = fileOps.join ( targetRoot + '/' + target );
  await fileOps.createDir ( allButLastSegment ( filename ) )
  if ( typeof content === 'string' ) return fileOps.saveFile ( filename, content );
  if ( typeof content === undefined ) return
}


export async function saveMergedFiles ( context: string, fileOps: FileOps, options: CopyFileOptions, targetRoot: string, files: NameAnd<SourcedTemplateFileDetailsWithContent | SourcedTemplateFileDetailsWithContent[]> ) {
  return mapObjectK ( files, async ( fac, name ) =>
    mapK ( toArray ( fac ), async fac =>
      saveOneTemplateFile ( context, fileOps, options, targetRoot, fac ) ) )
}
export async function loadTemplateDetailsAndFileContents ( context: string, fileOps: FileOps, template: string, options: CopyFileOptions ): Promise<ErrorsAnd<NameAnd<SourcedTemplateFileDetailsWithContent>>> {
  const templateFile = await loadTemplateControlFile ( context, fileOps ) ( template )
  const filesAndContent = await mapErrorsK ( templateFile, async ( { files } ) => await loadFilesInTemplate ( files, fileOps, options ) )
  const merged = mapErrors ( filesAndContent, mergeFiles ( context ) )
  const postProcessed = await mapErrorsK ( merged, postProcessFiles ( context, fileOps, options ) )
  return postProcessed;
}
export async function copyFromTemplate ( context: string, fileOps: FileOps, options: CopyFileOptions, template: string, targetRoot: string ) {
  const postProcessed: ErrorsAnd<NameAnd<SourcedTemplateFileDetailsWithContent>> = await loadTemplateDetailsAndFileContents ( context, fileOps, template, options );
  await mapErrorsK ( postProcessed, files => saveMergedFiles ( context, fileOps, options, targetRoot, files ) )
}
export async function findTemplateLookup ( context: string, fileOps: FileOps, options: CopyFileOptions, templates: NameAnd<string>, filename: string ): Promise<ErrorsAnd<any>> {
  return mapObjectK ( templates, async ( template, name ) => {
    const data = await loadTemplateDetailsAndFileContents ( context, fileOps, template, {
      ...options, filter: name => name === filename
    } )

    if ( hasErrors ( data ) ) return data
    const content = data[ filename ]?.content;
    if ( content === undefined ) return [ `${context} Template [${template}] Filename[${filename}] cannot be found. Legal values are [${Object.keys ( data )}]` ]
    if ( typeof content !== 'string' ) throw Error ( `${context}. Error in template. Content is not a string. It is ${typeof content} ${JSON.stringify ( content, null, 2 )}` )
    return parseJson ( context ) ( content )
  } )
}

export const validateTemplates = async ( context: string, fileOps: FileOps, options: CopyFileOptions, templates: NameAnd<any> ): Promise<string[]> =>
  flatMapK ( Object.entries ( templates ), async ( [ name, url ] ) =>
    errors ( await loadTemplateDetailsAndFileContents ( context, fileOps, url, options ) ) );