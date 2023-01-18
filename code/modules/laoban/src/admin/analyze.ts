//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { gatherInitData, InitData, isSuccessfulInitData, ProjectDetailsAndTemplate, SuccessfullInitData, TypeCmdOptions } from "./init";

import { FileOps, parseJson } from "@laoban/fileops";
import { loabanConfigName, packageDetailsFile } from "../Files";
import { ActionParams } from "./types";
import { SuccessfullInitSuggestions } from "./initStatus";
import { fromEntries, jsonDelta } from "@laoban/utils";
import { createDeltaForPackageJson } from "./update-template";
import { ConfigAndIssues } from "../config";
import { loadLaobanAndIssues, makeCache } from "../configProcessor";
import { includeAndTransformFile, loadOneFileFromTemplateControlFileDetails } from "../update";

interface AnalyzePackagesCmd extends TypeCmdOptions {
  showimpact?: boolean
}

export async function showImpact ( { fileOps, currentDirectory, cmd }: ActionParams<AnalyzePackagesCmd>, initData: SuccessfullInitData, configAndIssues: ConfigAndIssues ) {
  async function findTemplatePackage ( p: ProjectDetailsAndTemplate ) {
    if ( configAndIssues.issues.length === 0 ) {
      const templateUrl = configAndIssues.config.templates[ p.template ]
      if ( templateUrl === undefined ) console.log ( `Directory ${p.directory} uses template ${p.template} which is not defined in ${loabanConfigName}` )
      else {
        const context = `Loading ${packageDetailsFile} for ${p.directory} from ${templateUrl}`
        const templateJson = await loadOneFileFromTemplateControlFileDetails ( context, fileOps, templateUrl, includeAndTransformFile ( context, {}, fileOps ) ) ( 'package.json' )

        const packageJson = parseJson ( context ) ( templateJson )
        return packageJson
      }
    }
    return p.templatePackageJson;
  }
  const result: [ string, any ][] = await Promise.all<[ string, any ]> ( initData.projectDetails.map ( async p => {
    const templatePackage = await findTemplatePackage ( p )
    const packageJsonAsString = await fileOps.loadFileOrUrl ( fileOps.join ( p.directory, 'package.json' ) )
    const packageJson = parseJson ( `Parsing package.json in ${p.directory}` ) ( packageJsonAsString )
    // console.log(' createDeltaForPackageJson', templatePackage, packageJson)
    const delta = createDeltaForPackageJson ( templatePackage, packageJson, { showDiff: ( temp, pack ) => `${pack} => ${temp}`, onlyUpdate: true } )
    // console.log(' delta', delta)
    const result: [ string, any ] = [ p.directory, delta ];
    return result
  } ) )
  console.log ( JSON.stringify ( fromEntries ( ...result ), null, 2 ) )
}

export async function analyze ( ap: ActionParams<AnalyzePackagesCmd> ) {
  const { fileOps, currentDirectory, cmd, params, outputStream } = ap
  const initData: InitData = await gatherInitData ( fileOps, currentDirectory, cmd, false );
  async function findActualTemplateIfExists ( p: ProjectDetailsAndTemplate ) {
     try{
       const s = await fileOps.loadFileOrUrl ( fileOps.join ( p.directory, packageDetailsFile ) )
       const parse= parseJson<any>(`Loading ${packageDetailsFile} for ${p.directory}`)(s)
       return parse.template
     } catch ( e ) {
       return undefined
     }
  }
  if ( isSuccessfulInitData ( initData ) ) {
    const configAndIssues: ConfigAndIssues = await loadLaobanAndIssues ( fileOps, makeCache ) ( process.cwd (), params, outputStream )

    if ( configAndIssues.issues.length > 0 ) console.log ( `Cannot use an existing ${loabanConfigName}` )
    if ( cmd.showimpact ) return showImpact ( ap, initData, configAndIssues )

    const { suggestions, initFileContents } = initData;
    suggestions.comments.forEach ( c => console.log ( c ) )
    console.log ( `Would put ${loabanConfigName} into `, suggestions.laobanJsonLocation, ' which allows the following templates', initData.parsedLaoBan.templates )
    const dirs = initData.projectDetails.map ( p => p.directory )
    if ( dirs.length === 0 ) {
      console.log ( 'No projects found' )
      return
    }
    const longestDirLength = dirs.map ( p => p.length ).reduce ( ( a, b ) => Math.max ( a, b ), 0 )
    const longestGuessedTemplateLength = [ 'Guessed Template', ...initData.projectDetails.map ( p => p.template ) ].reduce ( ( a, b ) => Math.max ( a, b.length ), 0 )
    console.log ( 'package.json'.padEnd ( longestDirLength ), '    Guessed Template    Actual Template' )
    await Promise.all ( initData.projectDetails.map ( async p => {
      const foundDetails = await findActualTemplateIfExists ( p )
      console.log ( '   ', p.directory.padEnd ( longestDirLength ), p.template.padEnd ( longestGuessedTemplateLength ),'  ', foundDetails?foundDetails:'---' );
    } ) )
    console.log ( 'Suggested version number is ', suggestions.version )
    console.log ( 'run' )
    console.log ( '     laoban admin analyze --showimpact' )
    console.log ( 'to see if any version numbers would be impacted' )
  } else {
    console.log ( 'Had problems with the configuration' )
    const { suggestions } = initData;
    suggestions.comments.forEach ( c => console.log ( c ) )
  }
}