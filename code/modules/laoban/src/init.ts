import { ConfigAndIssues } from "./config";
import path from "path";
import { output } from "./utils";
import { FileOps } from "@phil-rice/utils";

export async function init ( fileOps: FileOps, configAndIssues: ConfigAndIssues, dir: string, cmd: any ): Promise<void> {
  const force = cmd.force
  const types = cmd.types
  const listTypes = cmd.listtypes
  const inits = JSON.parse ( await fileOps.loadFileOrUrl ( configAndIssues.config.inits ) )
  if ( listTypes ) {
    configAndIssues.outputStream.write ( `Listing types from  ${(configAndIssues.config.inits)}\n${JSON.stringify ( inits, null, 2 )}` );
    return Promise.resolve ()
  }
  const errors = types.filter ( t => Object.keys ( inits ).indexOf ( t ) === -1 )
  if ( errors.length > 0 ) {
    console.error ( `The following types are not defined : ${errors.join ( ', ' )}. Legal values are ${JSON.stringify ( Object.keys ( inits ) )}` )
    return Promise.resolve ()
  }
  const actualInits = Promise.all ( Object.values(inits).map ( fileOps.loadFileOrUrl ) )
  console.log ( 'init', actualInits )
  let file = path.join ( dir, 'laoban.json' );
  if ( !force && configAndIssues.config ) return Promise.resolve ( output ( configAndIssues ) ( `This project already has a laoban.json in ${configAndIssues.config.laobanDirectory}. Use --force if you need to create one here` ) )
  return fileOps.saveFile ( file, defaultLaobanJson )
}

export function initProjects ( fileOps: FileOps ) {

}

export const defaultLaobanJson = `{
  "packageManager": "yarn",
  "parents":        [
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/core.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.publish.laoban.json"
  ]
}`