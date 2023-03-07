import { ActionParams } from "./types";
import { ConfigWithDebug } from "../config";
import { loabanConfigName, packageDetailsFile } from "../Files";
import { fileNameFrom, FileOps, FileOpsAndXml, isFilename, isUrl, loadFileFromDetails, loadTemplateDetailsAndFileContents, LocationAndContents, parseJson, saveAll, SourcedTemplateFileDetailsWithContent, targetFrom } from "@laoban/fileops";
import { getTemplateJsonFileName } from "./newTemplate";
import { includeAndTransformFile, makeCopyOptions } from "../update";
import { deepCombineTwoObjects, ErrorsAnd, hasErrors, jsonDelta, JsonDeltaOptions, keep, mapObjectK, NameAnd, singleOrArrayOrUndefined, toArray } from "@laoban/utils";
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
  templateFiles: NameAnd<SourcedTemplateFileDetailsWithContent>
}

async function findTemplateDetailsAndContent ( fileOpsAndXml: FileOpsAndXml, directory: string, config: ConfigWithDebug ): Promise<ErrorsAnd<TemplateDetailsAndContent>> {
  const { fileOps } = fileOpsAndXml
  const pdFileName = fileOps.join ( directory, packageDetailsFile );
  if ( !await fileOps.isFile ( pdFileName ) ) return [ `No package details file found at ${pdFileName}` ]
  const pdString = await fileOps.loadFileOrUrl ( pdFileName )
  const pd = parseJson<any> ( `Loading ${pdFileName}` ) ( pdString )
  const templateName = pd.template
  if ( !templateName ) return [ `No template in ${pdFileName}` ]
  const templateDirUrl = config.templates[ templateName ]
  if ( !templateDirUrl ) return [ `File ${pdFileName}. No template url for ${templateName} in ${JSON.stringify ( config.templates )}` ]

  const context = `Loading template [${templateName}] which maps to [${templateDirUrl}]`;
  const copyFileOptions = makeCopyOptions ( context, fileOpsAndXml, {}, config, undefined, pd )

  const templateFiles: ErrorsAnd<NameAnd<SourcedTemplateFileDetailsWithContent>> = await loadTemplateDetailsAndFileContents ( context, fileOpsAndXml, templateDirUrl, copyFileOptions )
  if ( hasErrors ( templateFiles ) ) return templateFiles;
  return { templateDirUrl, templateName, templateFiles };
}


function getPostProcessAddingToOriginalForPackageJson ( templateDirUrl: string, f: SourcedTemplateFileDetailsWithContent ) {
  const isReference = ( p: string ) => p.startsWith ( 'jsonMergeInto' ) || p.startsWith ( 'packageJson(' );
  const modified = toArray ( f.postProcess ).map ( p => {
    if ( isReference ( p ) )
      return p.includes ( '()' )
        ? p.replace ( '()', `(${templateDirUrl}/package.json)` )
        : p.replace ( ')', `,${templateDirUrl}/package.json)` );
    else return p
  } )
  if ( modified.find ( isReference ) ) return singleOrArrayOrUndefined ( modified )
  return singleOrArrayOrUndefined ( [ ...modified, `packageJson(${templateDirUrl}/package.json)` ] )
}

async function transformTemplate ( fileOps: FileOps, td: TemplateDetailsAndContent, error: ( msg: string ) => void ): Promise<NameAnd<SourcedTemplateFileDetailsWithContent>> {
  const { templateDirUrl, templateName, templateFiles } = td;
  const transformedJson: NameAnd<SourcedTemplateFileDetailsWithContent> = await mapObjectK<SourcedTemplateFileDetailsWithContent, SourcedTemplateFileDetailsWithContent> ( templateFiles, async f => {
    const { file, target } = f
    const cleanF = keep ( f, 'file', 'target', 'templated', 'type', 'postProcess', 'sample', 'mergeWithParent', 'directory' );
    if ( target === 'package.json' ) {
      if ( isUrl ( file ) ) {
        const postProcessAddingToOriginalForPackageJson = getPostProcessAddingToOriginalForPackageJson ( templateDirUrl, f );
        return {
          ...cleanF,
          file: 'package.json',
          postProcess: postProcessAddingToOriginalForPackageJson,
        }
      }
      return { ...cleanF, file: 'package.json' } //keep the original postProcess.
    }

    return { ...cleanF }//, file: newFileName, target }
  } )
  return transformedJson
}
async function loadCurrentPackageJson ( fileOps: FileOps, directory: string ) {
  const packageJsonFileName = fileOps.join ( directory, 'package.json' )
  const packageJsonString = await fileOps.loadFileOrUrl ( packageJsonFileName )
  const packageJson = parseJson<any> ( `Loading ${packageJsonFileName}` ) ( packageJsonString )
  return packageJson
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
export async function updateTemplate ( { fileOpsAndXml, cmd, currentDirectory, params, outputStream }: ActionParams<UpdateTemplateCmd> ): Promise<void> {
  const { fileOps } = fileOpsAndXml
  function error ( msg: string ) {
    console.error ( msg )
    process.exit ( 1 )
  }
  const config: ConfigWithDebug = await loadConfigForAdmin ( fileOpsAndXml, cmd, currentDirectory, params, outputStream )

  const directory = cmd.directory || currentDirectory
  const tdc = await findTemplateDetailsAndContent ( fileOpsAndXml, directory, config );
  if ( hasErrors ( tdc ) ) {
    reportError ( tdc );
    return
  }
  const { templateDirUrl, templateName, templateFiles } = tdc
  const originalTemplatePackageCfd = templateFiles[ 'package.json' ]
  if ( originalTemplatePackageCfd === undefined ) {
    console.log ( `there is no package.json defined in the template file ${templateDirUrl}` )
    return
  }
  const transformedJson = await transformTemplate ( fileOps, tdc, error )

  const packageJson = await loadCurrentPackageJson ( fileOps, directory );
  const originalPackageJson = parseJson<any> ( `Parsing package json from ${templateDirUrl}` ) ( originalTemplatePackageCfd.content as string )
  const delta = createDeltaForPackageJson ( originalPackageJson, packageJson, { onlyUpdate: true } );
  const originalTemplateWasFile = isFilename ( templateDirUrl );
  async function findOriginalRawTemplate () {
    if ( originalTemplateWasFile ) {
      const parse = parseJson<any> ( `Loading raw template from ${templateDirUrl}` );
      const asString = await fileOps.loadFileOrUrl ( getTemplateJsonFileName ( fileOps, templateDirUrl ) );
      const templateFile = parse ( asString );
      const originalTemplate = templateFile.files[ 'package.json' ]
      if ( originalTemplate === undefined ) throw Error ( `There is no package.json defined in the template file ${templateDirUrl}\n${JSON.stringify ( templateFile )}` )
      const result = parse ( await fileOps.loadFileOrUrl ( fileOps.join ( templateDirUrl, fileNameFrom ( originalTemplate ) ) ) )
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