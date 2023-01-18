import { ActionParams } from "./types";
import { ConfigWithDebug } from "../config";
import { loabanConfigName, packageDetailsFile } from "../Files";
import { addPrefixIfFile, CopyFileDetails, fileNameFrom, FileOps, isFilename, isTemplateFileDetails, isUrl, loadFileFromDetails, LocationAndContents, parseJson, saveAll, targetFrom, TemplateFileDetails } from "@laoban/fileops";
import { getTemplateJsonFileName } from "./newTemplate";
import { includeAndTransformFile, TemplateControlFile } from "../update";
import { deepCombineTwoObjects, jsonDelta, JsonDeltaOptions, NameAnd, singleOrArrayOrUndefined, toArray } from "@laoban/utils";
import { derefence, dollarsBracesVarDefn } from "@laoban/variables";
import { loadConfigForAdmin } from "./laoban-admin";
import { CommanderStatic } from "commander";

interface UpdateTemplateCmd {
  directory?: string
  dryrun?: boolean
}

export function updateTemplateOptions<T extends CommanderStatic> ( envs: NameAnd<string>, p: T ): T {
  return p.option ( '-d,--directory <directory>', 'the directory of the template to update' )
    .option ( '-d,--dryrun', `Just displays the files that would be created` )
}

interface TemplateDetailsAndContent {
  templateName: string
  templateDirUrl: string
  templateJsonFileName: string
  templateJson: any
}

async function findTemplateDetailsAndContent ( fileOps: FileOps, directory: string, error: ( msg: string ) => void, config: ConfigWithDebug ): Promise<TemplateDetailsAndContent> {
  const pdFileName = fileOps.join ( directory, packageDetailsFile );
  if ( !await fileOps.isFile ( pdFileName ) ) error ( `No package details file found at ${pdFileName}` )
  const pdString = await fileOps.loadFileOrUrl ( pdFileName )
  const pd = parseJson<any> ( `Loading ${pdFileName}` ) ( pdString )
  const templateName = pd.template
  if ( !templateName ) error ( `No template in ${pdFileName}` )
  const templateDirUrl = config.templates[ templateName ]
  if ( !templateDirUrl ) error ( `File ${pdFileName}. No template url for ${templateName} in ${JSON.stringify ( config.templates )}` )
  const templateJsonFileName = getTemplateJsonFileName ( fileOps, templateDirUrl );

  const template = await fileOps.loadFileOrUrl ( templateJsonFileName )
  const templateJson = parseJson<TemplateControlFile> ( `Loading template ${templateName} which is ${templateJsonFileName}` ) ( template )
  if ( !templateJson.files ) error ( `Malformed ${templateJsonFileName}. No files property` )
  return { templateDirUrl, templateName, templateJsonFileName, templateJson };
}


function transformTemplate ( fileOps: FileOps, td: TemplateDetailsAndContent, error: ( msg: string ) => void ): CopyFileDetails[] {
  const { templateDirUrl, templateJson, templateJsonFileName } = td;

  const transformedJson: CopyFileDetails[] = templateJson.files.map ( f => {
    const fileName = fileNameFrom ( f );
    const target = targetFrom ( f );
    const file = fileOps.join ( templateDirUrl, fileName );
    if ( typeof f === 'string' ) return { file: file.replace ( /\\/g, '/' ), target: f }
    const newFileName = addPrefixIfFile ( fileOps, templateDirUrl, fileName ).replace ( /\\/g, '/' );
    function getPostProcessAddingToOriginal ( f: TemplateFileDetails ) {
      const modified = toArray ( f.postProcess ).map ( p => p.includes ( 'jsonMergeInto' ) ? p.replace ( ')', `,${templateDirUrl}/package.json)` ) : p )
      if ( modified.find ( p => p.includes ( 'jsonMergeInto' ) ) ) return singleOrArrayOrUndefined ( modified )
      return singleOrArrayOrUndefined ( [ ...modified, `jsonMergeInto(${templateDirUrl}/package.json)` ] )
    }
    if ( target === 'package.json' ) {
      if ( isUrl ( file ) ) return {
        ...f,
        file: 'package.json',
        postProcess: getPostProcessAddingToOriginal ( f ),
      }
      return { ...f, file: 'package.json' } //keep the original postProcess.
    }
    if ( isTemplateFileDetails ( f ) ) {
      return { ...f, file: newFileName, target }
    }
    throw error ( `Malformed ${templateJsonFileName}. File ${JSON.stringify ( f )} is not a string or a {file:..., target: ...}` )
  } )
  return transformedJson;
}
async function loadOriginalAndCurrentPackageJson ( fileOps: FileOps, directory: string, templateDirUrl: string, originalTemplatePackageCfd ) {
  const packageJsonFileName = fileOps.join ( directory, 'package.json' )
  const packageJsonString = await fileOps.loadFileOrUrl ( packageJsonFileName )
  const packageJson = parseJson<any> ( `Loading ${packageJsonFileName}` ) ( packageJsonString )

  const loadOriginalJsonContext = `Loading original package`
  const { postProcessed } = await loadFileFromDetails ( loadOriginalJsonContext, fileOps, templateDirUrl, includeAndTransformFile ( loadOriginalJsonContext, {}, fileOps ), originalTemplatePackageCfd )
  const originalPackageJson = parseJson<any> ( `Loading ${JSON.stringify ( originalTemplatePackageCfd )}` ) ( postProcessed )
  return { originalPackageJson, packageJson };
}

export function createDeltaForPackageJson ( originalPackageJson: any, packageJson: any, options: JsonDeltaOptions ) {
  packageJson.name = originalPackageJson.name
  packageJson.description = originalPackageJson.description
  packageJson.version = originalPackageJson.version
  packageJson.license = originalPackageJson.license
  packageJson.repository = originalPackageJson.repository
  const result = jsonDelta ( originalPackageJson, packageJson, options );
  // console.log ( 'jsonDelta - originalPackageJson', typeof originalPackageJson, originalPackageJson )
  // console.log ( 'jsonDelta - packageJson', typeof packageJson, packageJson )
  // console.log ( 'jsonDelta - result', result )
  return result;
}
export async function updateTemplate ( { fileOps, cmd, currentDirectory, params, outputStream }: ActionParams<UpdateTemplateCmd> ) {
  function error ( msg: string ) {
    console.error ( msg )
    process.exit ( 1 )
  }
  const config: ConfigWithDebug = await loadConfigForAdmin ( fileOps, cmd, currentDirectory, params, outputStream )
  const directory = cmd.directory || currentDirectory
  const tdc = await findTemplateDetailsAndContent ( fileOps, directory, error, config );
  const { templateDirUrl, templateName, templateJson } = tdc
  const transformedJson = transformTemplate ( fileOps, tdc, error );
  const originalTemplatePackageCfd = templateJson.files.find ( f => targetFrom ( f ) === 'package.json' )
  if ( originalTemplatePackageCfd === undefined ) {
    console.log ( `there is no package.json defined in the template file ${templateDirUrl}` )
    return
  }
  console.log ( 'templateJson', transformedJson )
  const { originalPackageJson, packageJson } = await loadOriginalAndCurrentPackageJson ( fileOps, directory, templateDirUrl, originalTemplatePackageCfd );
  const delta = createDeltaForPackageJson ( originalPackageJson, packageJson, { onlyUpdate: true } );
  const originalTemplateWasFile = isFilename ( templateDirUrl );
  async function findOriginalRawTemplate () {
    if ( originalTemplateWasFile ) {
      const parse = parseJson<any> ( `Loading raw template from ${templateDirUrl}` );
      const asString = await fileOps.loadFileOrUrl ( getTemplateJsonFileName ( fileOps, templateDirUrl ) );
      const templateFile = parse ( asString );
      const originalTemplate = templateFile.files.find ( f => targetFrom ( f ) === 'package.json' )
      if ( originalTemplate === undefined ) throw Error ( `There is no package.json defined in the template file ${templateDirUrl}\n${JSON.stringify ( templateFile )}` )
      const result = parse(await fileOps.loadFileOrUrl ( fileOps.join ( templateDirUrl, fileNameFrom ( originalTemplate ) ) ))
      return result
    }
    return {}
  }
  const originalRawTemplate = await findOriginalRawTemplate ()

  const newPackageJson = originalTemplateWasFile ? deepCombineTwoObjects ( originalRawTemplate, delta ) : delta

  if ( cmd.dryrun ) {
    console.log ( '.template.json', transformedJson )
    console.log ( 'package.json', newPackageJson )
    return
  }
  const newTemplateDirectory = derefence ( '', config, fileOps.join ( config.templateDir || directory, templateName ), { variableDefn: dollarsBracesVarDefn } )
  const packageJsonLocAndData: LocationAndContents<string> = { location: fileOps.join ( newTemplateDirectory, 'package.json' ), directory: newTemplateDirectory, contents: JSON.stringify ( newPackageJson, null, 2 ) }
  const dotTemplateLocAndData: LocationAndContents<string> = { location: getTemplateJsonFileName ( fileOps, newTemplateDirectory ), directory: newTemplateDirectory, contents: JSON.stringify ( { files: transformedJson }, null, 2 ) }
  const laobanFileName = fileOps.join ( config.laobanDirectory, loabanConfigName );
  const laoban = await fileOps.loadFileOrUrl ( laobanFileName )
  const laobanJson = parseJson<any> ( `Loading ${laobanFileName}` ) ( laoban )
  const templates = laobanJson.templates || {}
  templates[ templateName ] = fileOps.relative ( config.laobanDirectory, newTemplateDirectory ).replace ( /\\/g, '/' )
  const laobanLocAndData: LocationAndContents<string> = {
    location: laobanFileName, directory: config.laobanDirectory,
    contents: JSON.stringify ( { ...laobanJson, templates }, null, 2 )
  }
  const files = [ packageJsonLocAndData, dotTemplateLocAndData, laobanLocAndData ]
  // console.log ( 'files', files )
  saveAll ( fileOps ) ( files )
  console.log ( 'templates', templates )

}