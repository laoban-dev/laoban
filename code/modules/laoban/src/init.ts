import { Action, ConfigAndIssues } from "./config";
import * as fs from "fs";
import path from "path";
import { output } from "./utils";
import { FileOps } from "@phil-rice/utils";

export function init ( fileOps: FileOps, configAndIssues: ConfigAndIssues, dir: string, cmd: any ): Promise<void> {
  const force = cmd.force
  const types = cmd.types
  const listTypes = cmd.listtypes
  if ( listTypes ) {
    let inits = configAndIssues.config.inits;
    configAndIssues.outputStream.write ( `Listing types from  ${inits} ` );
    fileOps.loadFileOrUrl ( inits ).then ( result => configAndIssues.outputStream.write ( result ) )
    return Promise.resolve ()
  }
  console.log ( 'init', cmd )
  console.log ( 'init', dir, force, types, listTypes )
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