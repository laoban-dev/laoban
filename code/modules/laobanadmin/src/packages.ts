//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { gatherInitData, InitData, isSuccessfulInitData, TypeCmdOptions } from "./init";
import { loabanConfigName } from "laoban/dist/src/Files";
import { FileOps } from "@laoban/fileops";

interface ProjectCmdOptions extends TypeCmdOptions {

}

export async function packages ( fileOps: FileOps, directory: string, cmd: ProjectCmdOptions ) {
  const initData: InitData = await gatherInitData ( fileOps, directory, cmd, false );
  if ( isSuccessfulInitData ( initData ) ) {
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
  } else {
    console.log ( 'Had problems with the configuration' )
    const { suggestions } = initData;
    suggestions.comments.forEach ( c => console.log ( c ) )
  }
}