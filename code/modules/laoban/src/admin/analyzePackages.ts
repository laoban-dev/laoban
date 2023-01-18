//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { gatherInitData, InitData, isSuccessfulInitData, SuccessfullInitData, TypeCmdOptions } from "./init";

import { FileOps, parseJson } from "@laoban/fileops";
import { loabanConfigName } from "../Files";
import { ActionParams } from "./types";
import { SuccessfullInitSuggestions } from "./initStatus";
import { fromEntries, jsonDelta } from "@laoban/utils";
import { createDeltaForPackageJson } from "./update-template";

interface AnalyzePackagesCmd extends TypeCmdOptions {
  showimpact?: boolean
}

export async function showImpact ( { fileOps, currentDirectory, cmd }: ActionParams<AnalyzePackagesCmd>, initData: SuccessfullInitData ) {
  const result: [ string, any ][] = await Promise.all<[ string, any ]> ( initData.projectDetails.map ( async p => {
    const templatePackage = p.templatePackageJson
    const packageJsonAsString = await fileOps.loadFileOrUrl ( fileOps.join ( p.directory, 'package.json' ) )
    const packageJson = parseJson ( `Parsing package.json in ${p.directory}` ) ( packageJsonAsString )
    const delta = createDeltaForPackageJson ( templatePackage, packageJson, { showDiff: ( temp, pack ) => `${pack} => ${temp}`, onlyUpdate: true } )
    const result: [ string, any ] = [ p.directory, delta ];
    return result
  } ) )
  console.log ( JSON.stringify ( fromEntries ( ...result ), null, 2 ) )
}

export async function analyzepackages ( ap: ActionParams<AnalyzePackagesCmd> ) {
  const { fileOps, currentDirectory, cmd } = ap
  const initData: InitData = await gatherInitData ( fileOps, currentDirectory, cmd, false );
  if ( isSuccessfulInitData ( initData ) ) {
    if ( cmd.showimpact ) return showImpact ( ap, initData )
    const { suggestions, initFileContents } = initData;
    suggestions.comments.forEach ( c => console.log ( c ) )
    console.log ( `Would put ${loabanConfigName} into `, suggestions.laobanJsonLocation, ' which allows the following templates', initData.parsedLaoBan.templates )
    const dirs = initData.projectDetails.map ( p => p.directory )
    if ( dirs.length === 0 ) {
      console.log ( 'No projects found' )
      return
    }
    const longestDirLength = dirs.map ( p => p.length ).reduce ( ( a, b ) => Math.max ( a, b ), 0 )
    console.log ( 'package.json'.padEnd ( longestDirLength ), '    Guessed Template' )
    initData.projectDetails.forEach ( p => {
      const template = p.template
      console.log ( '   ', p.directory.padEnd ( longestDirLength ), template );
    } )
    console.log ( 'Suggested version number is ', suggestions.version )
    console.log ( 'run' )
    console.log ( '     laoban admin analyzepackages --showimpact' )
    console.log ( 'to see if any version numbers would be impacted' )
  } else {
    console.log ( 'Had problems with the configuration' )
    const { suggestions } = initData;
    suggestions.comments.forEach ( c => console.log ( c ) )
  }
}