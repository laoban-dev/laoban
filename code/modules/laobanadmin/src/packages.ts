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