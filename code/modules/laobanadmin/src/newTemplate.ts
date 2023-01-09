import { CopyFileDetails, copyFiles, fileNameFrom, FileOps, findChildFiles, loadAllFilesIn, parseJson, partitionLocationAndContents } from "@laoban/fileops";
import { NullDebugCommands } from "@laoban/debug";
import { allButLastSegment, lastSegment, unique } from "@laoban/utils";
import { findLaobanUpOrDown } from "./init";


interface CreateTemplateOptions {
  dryrun?: boolean
  force?: boolean
  directory: string
  template: string
  templatename?: string
}
async function makeTemplateFor ( fileOps: FileOps, dir: string ) {
  const contents = await loadAllFilesIn ( fileOps, dir )
  const { locationAndErrors, locationAnd } = partitionLocationAndContents ( contents )
  if ( locationAndErrors.length > 0 ) {
    console.log ( `There were errors loading template files in dir ${dir}. Errors are: ${JSON.stringify ( locationAndErrors, null, 2 )}` )
    process.exit ( 1 )
  }
  const templateContentsForFiles = locationAnd.map ( ( { location } ) => {
    return ({ target: location, file: location });
  } )
  return { files: templateContentsForFiles }
}

function calculateDirectory ( fileOps: FileOps, defaultDirectory: string, cmd: CreateTemplateOptions ) {
  if ( cmd.directory )
    return cmd.directory.includes ( ":/" ) ? cmd.directory : fileOps.join ( defaultDirectory, cmd.directory );
  else
    return defaultDirectory
}
async function findFilesForTemplate ( fileOps: FileOps, directory: string, cmd: CreateTemplateOptions ) {
  const ignoreDirectories = n => n === 'node_modules' || n.startsWith ( '.' ) || n === 'target' || n === 'dist'
  const fileNames = await findChildFiles ( fileOps, ignoreDirectories ) ( directory )
  return fileNames;
}
function makeDotTemplateJson ( fileNames: string[] ) {
  const files = fileNames.map ( file =>
    lastSegment ( file ) === 'package.json' ?
      { target: file, file: file, "type": "${}", "postProcess": "json" } :
      { file, target: file } )
  const templateJson = JSON.stringify ( { files }, null, 2 )
  return templateJson;
}
export async function newTemplate ( fileOps: FileOps, defaultDirectory: string, cmd: CreateTemplateOptions ): Promise<void> {
  const directory = calculateDirectory ( fileOps, defaultDirectory, cmd )
  if ( !await fileOps.isDirectory ( directory ) ) {
    console.error ( `Directory ${directory} does not exist` );
    process.exit ( 1 )
  }
  const fileNames: string[] = (await findFilesForTemplate ( fileOps, directory, cmd ))
    .filter ( f => !f.endsWith ( 'package.details.json' ) );
  const templateJson = makeDotTemplateJson ( fileNames );
  if ( cmd.dryrun ) console.log ( templateJson )
  const context = ``;
  const copyFileDetails: string[] = fileNames
  const templateName = cmd.templatename ? cmd.templatename : lastSegment ( directory )
  const target = fileOps.join ( cmd.template, templateName )
  if ( !cmd.dryrun ) console.log ( 'Making template in', target )
  const directoriesToCreate = unique<string> ( copyFileDetails.map ( f => allButLastSegment ( fileNameFrom ( f ) ) ), f => f )
    .filter ( f => f !== '' )
    .map ( d => fileOps.join ( target, d ) )

  if ( cmd.dryrun ) console.log ( `Directories to create: ${JSON.stringify ( directoriesToCreate )}` )
  else await Promise.all ( directoriesToCreate.map ( d => fileOps.createDir ( d ) ) )

  const cf = copyFiles ( context, fileOps, NullDebugCommands, directory, target, async ( type, text ) => text, cmd.dryrun )
  const copyFileDetailsWithPackageJsonSpecial: CopyFileDetails[] = copyFileDetails.map ( file =>
    lastSegment ( file ) === 'package.json' ? { file, postProcess: "turnIntoPackageJsonTemplate" } : file )

  const v = fileOps.join ( target, '.template.json' )
  await cf ( copyFileDetailsWithPackageJsonSpecial, cmd.dryrun )

  if ( cmd.dryrun ) console.log ( `Would write ${v} ` )
  else await fileOps.saveFile ( v, templateJson )

  const existingLaobanDirectory = await findLaobanUpOrDown ( fileOps, directory )
  console.log ( 'existingLaobanFile', existingLaobanDirectory )
  if ( existingLaobanDirectory ) {
    const laobanFileName = fileOps.join ( existingLaobanDirectory, 'laoban.json' )
    const laobanFile = await fileOps.loadFileOrUrl ( laobanFileName )
    const laoban = parseJson<any> ( () => `Loading ${laobanFileName} in order to update templates` ) ( laobanFile )
    const templates = laoban.templates || {}
    templates[ templateName ] = fileOps.relative ( existingLaobanDirectory, target )
    laoban.templates = templates
    console.log ( 'templates', templates )
    let newLaobanContents = JSON.stringify ( laoban, null, 2 );
    if ( !cmd.dryrun )
      return fileOps.saveFile ( laobanFileName, newLaobanContents )
  } else
    console.error ( 'No laoban.json file found so cannot update templates in it' )
}