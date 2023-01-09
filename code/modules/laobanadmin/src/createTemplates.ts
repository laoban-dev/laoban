import path from "node:path";
import { } from "@laoban/utils";
import { FileOps, findChildDirs, loadAllFilesIn, partitionLocationAndContents } from "@laoban/fileops";


interface CreateTemplateOptions {
  force?: boolean
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

export async function createTemplates ( fileOps: FileOps, directory: string, cmd: CreateTemplateOptions ): Promise<void> {
  const parent = path.basename ( path.dirname ( directory ) )
  if ( !parent.includes ( 'template' ) ) {
    console.log ( `The parent directory must have the word 'template' in it. The parent directory is [${parent}]. Full directory is [${directory}]` )
  }
  const dirs = await findChildDirs ( fileOps, () => false, () => Promise.resolve ( true ) ) ( directory )
  console.log ( JSON.stringify ( dirs, null, 2 ) )
  dirs.map( dir => makeTemplateFor ( fileOps, dir ) )
}