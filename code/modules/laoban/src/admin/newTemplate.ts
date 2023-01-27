//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { CopyFileDetails, copyFiles, fileNameFrom, FileOps, findChildFiles, findMatchingK, loadAllFilesIn, parseJson, partitionLocationAndContents, Path } from "@laoban/fileops";
import { NullDebugCommands } from "@laoban/debug";
import { allButLastSegment, lastSegment, unique } from "@laoban/utils";
import { findLaobanUpOrDown } from "./init";
import { loabanConfigName } from "../Files";
import { ActionParams, ShortActionParams } from "./types";
import { postProcessTurnPackageJsonIntoTemplate } from "@laoban/node";


interface MakeIntoTemplateOptions {
  dryrun?: boolean
  force?: boolean
  directory: string
  templatename?: string
}
interface CreateTemplateOptions extends MakeIntoTemplateOptions {
  template: string
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

function calculateDirectory ( fileOps: Path, defaultDirectory: string, cmd: CreateTemplateOptions ) {
  const cleanDirectory = cmd.directory?.replace ( /\\/g, '/' )
  if ( cleanDirectory )
    return cleanDirectory.includes ( ":/" ) || cleanDirectory.startsWith ( '/' ) ? cmd.directory : fileOps.join ( defaultDirectory, cmd.directory );
  else
    return defaultDirectory
}
async function findFilesForTemplate ( fileOps: FileOps, directory: string, cmd: CreateTemplateOptions ) {
  const ignoreDirectories = n => n === 'node_modules' || n === '.git' || n === '.idea' || n === 'target' || n === 'dist'
  const fileNames = await findChildFiles ( fileOps, ignoreDirectories ) ( directory )
  return fileNames;
}
function makeDotTemplateJsonObject ( fileNames: string[] ) {
  const files = fileNames.map ( file =>
    lastSegment ( file ) === 'package.json' ?
      { target: file, file: file, type: "${}", postProcess: "jsonMergeInto(@laoban@/templates/javascript/package.json)" } :
      { file, target: file } )
  return files;
}
function makeDotTemplateJson ( fileNames: string[] ) {
  const files = makeDotTemplateJsonObject ( fileNames );
  const templateJson = JSON.stringify ( { files }, null, 2 )
  return templateJson;
}
async function updateLaobanWithNewTemplate ( fileOps: FileOps, cmd: CreateTemplateOptions, directory: string, templateName: string, target: string ) {
  const existingLaobanDirectory = await findLaobanUpOrDown ( fileOps, directory )
  if ( existingLaobanDirectory ) {
    const laobanFileName = fileOps.join ( existingLaobanDirectory, loabanConfigName )
    const laobanFile = await fileOps.loadFileOrUrl ( laobanFileName )
    const laoban = parseJson<any> ( () => `Loading ${laobanFileName} in order to update templates` ) ( laobanFile )
    const templates = laoban.templates || {}
    templates[ templateName ] = fileOps.relative ( existingLaobanDirectory, target )
    laoban.templates = templates
    let newLaobanContents = JSON.stringify ( laoban, null, 2 );
    if ( !cmd.dryrun )
      return fileOps.saveFile ( laobanFileName, newLaobanContents )
  } else
    console.error ( `No ${loabanConfigName} file found so cannot update templates in it` )
}
async function createNeededDirectoriesForFilesNames ( copyFileDetails: string[], fileOps: FileOps, target: string, cmd: CreateTemplateOptions ) {
  const directoriesToCreate = unique<string> ( copyFileDetails.map ( f => allButLastSegment ( fileNameFrom ( f ) ) ), f => f )
    .filter ( f => f !== '' )
    .map ( d => fileOps.join ( target, d ) )

  if ( cmd.dryrun ) console.log ( `Directories to create: ${JSON.stringify ( directoriesToCreate )}` )
  else await Promise.all ( directoriesToCreate.map ( d => fileOps.createDir ( d ) ) )
}
async function copyTemplateFilesToTemplate ( fileOps: FileOps, directory: string, target: string, cmd: CreateTemplateOptions, copyFileDetails: string[] ) {
  const cf = copyFiles ( `Copying files to template ${target}`, fileOps, NullDebugCommands, directory, target,
    { tx: async ( type, text ) => text, dryrun: cmd.dryrun , postProcessor: postProcessTurnPackageJsonIntoTemplate} )
  const copyFileDetailsWithPackageJsonSpecial: CopyFileDetails[] = copyFileDetails.map ( file =>
    lastSegment ( file ) === 'package.json' ? { file, postProcess: "turnIntoPackageJsonTemplate" } : file )

  await cf ( copyFileDetailsWithPackageJsonSpecial )
}
export function getTemplateJsonFileName ( fileOps: Path, target: string ) {
  return fileOps.join ( target, '.template.json' );
}
async function saveDotTemplateJson ( cmd: CreateTemplateOptions, templateJson: string, fileOps: FileOps, target: string ) {
  if ( cmd.dryrun ) console.log ( templateJson )
  const templateJsonFileName = getTemplateJsonFileName ( fileOps, target )
  if ( cmd.dryrun ) console.log ( `Would write ${templateJsonFileName} ` )
  else await fileOps.saveFile ( templateJsonFileName, templateJson )
}
function calculateTemplateName ( cmd: CreateTemplateOptions, directory: string ) {
  const templateName = cmd.templatename ? cmd.templatename : lastSegment ( directory )
  return templateName;
}
export function calculateNewTemplateOptions ( fileOps: Path, currentDirectory: string, cmd: CreateTemplateOptions ) {
  const directory = calculateDirectory ( fileOps, currentDirectory, cmd )
  const templateName = calculateTemplateName ( cmd, directory );
  const target = fileOps.join ( cmd.template, templateName )
  return { directory, templateName, target };
}
async function checkDirectoryExists ( fileOps: FileOps, directory: string ) {
  if ( !await fileOps.isDirectory ( directory ) ) {
    console.error ( `Directory ${directory} does not exist` );
    process.exit ( 1 )
  }
}
export async function newTemplate ( { fileOps, currentDirectory, cmd }: ActionParams<CreateTemplateOptions> ): Promise<void> {
  const { directory, templateName, target } = calculateNewTemplateOptions ( fileOps, currentDirectory, cmd );
  await checkDirectoryExists ( fileOps, directory );

  const fileNames: string[] = (await findFilesForTemplate ( fileOps, directory, cmd )).filter ( f => !f.endsWith ( 'package.details.json' ) && !f.endsWith ( '.template.json' ) );

  if ( !cmd.dryrun ) console.log ( 'Making template in', target )

  await createNeededDirectoriesForFilesNames ( fileNames, fileOps, target, cmd );
  await copyTemplateFilesToTemplate ( fileOps, directory, target, cmd, fileNames );

  await updateLaobanWithNewTemplate ( fileOps, cmd, directory, templateName, target );
  const templateJson = makeDotTemplateJson ( fileNames );
  await saveDotTemplateJson ( cmd, templateJson, fileOps, target );
}

export async function makeIntoTemplate ( { fileOps, currentDirectory, cmd }: ShortActionParams<CreateTemplateOptions> ): Promise<void> {
  const directory = calculateDirectory ( fileOps, currentDirectory, cmd )
  const templateName = calculateTemplateName ( cmd, directory );
  await checkDirectoryExists ( fileOps, directory );
  const fileNames: string[] = (await findFilesForTemplate ( fileOps, directory, cmd )).filter ( f => !f.endsWith ( 'package.details.json' ) );
  let dotTemplateJsonFileName = getTemplateJsonFileName ( fileOps, currentDirectory );
  if ( await fileOps.isFile ( dotTemplateJsonFileName ) ) {
    let existingAsString = await fileOps.loadFileOrUrl ( dotTemplateJsonFileName );
    const existing = parseJson<any> ( () => `Loading ${dotTemplateJsonFileName} in order to update templates` ) ( existingAsString )
    const existingFiles = existing.files || []
    const newFiles = makeDotTemplateJsonObject ( fileNames )
    const files = newFiles.map ( newFile => {
      const existing = existingFiles.find ( existingFile => existingFile.file === newFile.file )
      return existing ? existing : newFile;
    } )
    await saveDotTemplateJson ( cmd, JSON.stringify ( { files }, null, 2 ), fileOps, directory );

  } else
    await saveDotTemplateJson ( cmd, makeDotTemplateJson ( fileNames ), fileOps, directory );
  await updateLaobanWithNewTemplate ( fileOps, cmd, directory, templateName, fileOps.join ( currentDirectory, templateName ) );
}

export async function updateAllTemplates ( params: ShortActionParams<CreateTemplateOptions> ): Promise<void> {
  const { fileOps, currentDirectory, cmd } = params;
  const directory = calculateDirectory ( fileOps, currentDirectory, cmd )
  const filesAndDirs = await fileOps.listFiles ( directory )
  const dirs = await findMatchingK ( filesAndDirs, async f => await fileOps.isDirectory ( fileOps.join ( directory, f ) ) )
  console.log ( `Will update [${dirs}] under ${directory}` )
  for ( const dir of dirs )
    await makeIntoTemplate ( { ...params, currentDirectory: fileOps.join ( directory, dir ) } )
}
