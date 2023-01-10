//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { CopyFileDetails, copyFiles, fileNameFrom, FileOps, findChildFiles, loadAllFilesIn, parseJson, partitionLocationAndContents, Path } from "@laoban/fileops";
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

function calculateDirectory ( fileOps: Path, defaultDirectory: string, cmd: CreateTemplateOptions ) {
  const cleanDirectory = cmd.directory?.replace ( /\\/g, '/' )
  if ( cleanDirectory )
    return cleanDirectory.includes ( ":/" ) || cleanDirectory.startsWith ( '/' ) ? cmd.directory : fileOps.join ( defaultDirectory, cmd.directory );
  else
    return defaultDirectory
}
async function findFilesForTemplate ( fileOps: FileOps, directory: string, cmd: CreateTemplateOptions ) {
  const ignoreDirectories = n => n === 'node_modules' || n === '.git'||n === '.idea'|| n === 'target' || n === 'dist'
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
async function updateLaobanWithNewTemplate ( fileOps: FileOps, cmd: CreateTemplateOptions, directory: string, templateName: string, target: string ) {
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
async function createNeededDirectoriesForFilesNames ( copyFileDetails: string[], fileOps: FileOps, target: string, cmd: CreateTemplateOptions ) {
  const directoriesToCreate = unique<string> ( copyFileDetails.map ( f => allButLastSegment ( fileNameFrom ( f ) ) ), f => f )
    .filter ( f => f !== '' )
    .map ( d => fileOps.join ( target, d ) )

  if ( cmd.dryrun ) console.log ( `Directories to create: ${JSON.stringify ( directoriesToCreate )}` )
  else await Promise.all ( directoriesToCreate.map ( d => fileOps.createDir ( d ) ) )
}
async function copyTemplateFilesToTemplate ( fileOps: FileOps, directory: string, target: string, cmd: CreateTemplateOptions, copyFileDetails: string[] ) {
  const cf = copyFiles ( `Copying files to template ${target}`, fileOps, NullDebugCommands, directory, target, async ( type, text ) => text, cmd.dryrun )
  const copyFileDetailsWithPackageJsonSpecial: CopyFileDetails[] = copyFileDetails.map ( file =>
    lastSegment ( file ) === 'package.json' ? { file, postProcess: "turnIntoPackageJsonTemplate" } : file )

  await cf ( copyFileDetailsWithPackageJsonSpecial, cmd.dryrun )
}
async function saveDotTemplateJson ( cmd: CreateTemplateOptions, templateJson: string, fileOps: FileOps, target: string ) {
  if ( cmd.dryrun ) console.log ( templateJson )
  const templateJsonFileName = fileOps.join ( target, '.template.json' )
  if ( cmd.dryrun ) console.log ( `Would write ${templateJsonFileName} ` )
  else await fileOps.saveFile ( templateJsonFileName, templateJson )
}
export function calculateNewTemplateOptions ( fileOps: Path, currentDirectory: string, cmd: CreateTemplateOptions ) {
  const directory = calculateDirectory ( fileOps, currentDirectory, cmd )
  const templateName = cmd.templatename ? cmd.templatename : lastSegment ( directory )
  const target = fileOps.join ( cmd.template, templateName )
  return { directory, templateName, target };
}
export async function newTemplate ( fileOps: FileOps, currentDirectory: string, cmd: CreateTemplateOptions ): Promise<void> {
  const { directory, templateName, target } = calculateNewTemplateOptions ( fileOps, currentDirectory, cmd );

  if ( !await fileOps.isDirectory ( directory ) ) {
    console.error ( `Directory ${directory} does not exist` );
    process.exit ( 1 )
  }

  const fileNames: string[] = (await findFilesForTemplate ( fileOps, directory, cmd )).filter ( f => !f.endsWith ( 'package.details.json' ) );

  if ( !cmd.dryrun ) console.log ( 'Making template in', target )

  await createNeededDirectoriesForFilesNames ( fileNames, fileOps, target, cmd );
  await copyTemplateFilesToTemplate ( fileOps, directory, target, cmd, fileNames );

  await updateLaobanWithNewTemplate ( fileOps, cmd, directory, templateName, target );
  const templateJson = makeDotTemplateJson ( fileNames );
  await saveDotTemplateJson ( cmd, templateJson, fileOps, target );
}