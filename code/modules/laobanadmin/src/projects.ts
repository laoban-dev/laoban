import { findInitFileContents, findLaobanUpOrDown, gatherInitData, InitData, isSuccessfulInitData, TypeCmdOptions } from "./init";
import { InitSuggestions, isSuccessfulInitSuggestions, suggestInit } from "./status";
import { FileOps } from "@phil-rice/utils";

interface ProjectCmdOptions extends TypeCmdOptions {

}

export async function projects ( fileOps: FileOps, directory: string, cmd: ProjectCmdOptions ) {
  const initData: InitData = await gatherInitData ( fileOps, directory, cmd );
  if ( isSuccessfulInitData ( initData ) ) {
    const { suggestions, initFileContents } = initData;
    suggestions.comments.forEach ( c => console.log ( c ) )
    console.log ( 'Would put laoban.json into ', suggestions.laobanJsonLocation, ' which allows the following templates', initData.parsedLaoBan.templates )
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
  } else {
    console.log ( 'Had problems with the configuration' )
    const { suggestions } = initData;
    suggestions.comments.forEach ( c => console.log ( c ) )
  }
}