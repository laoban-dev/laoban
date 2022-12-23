import { ConfigAndIssues } from "./config";
import * as fs from "fs";
import path from "path";
import { output } from "./utils";
import { FileOps } from "@phil-rice/utils";

export function init ( fileOps: FileOps, configAndIssues: ConfigAndIssues, dir: string, force: undefined | boolean ) {
  let file = path.join ( dir, 'laoban.json' );
  if ( !force && configAndIssues.config ) return output ( configAndIssues ) ( `This project already has a laoban.json in ${configAndIssues.config.laobanDirectory}. Use --force if you need to create one here` )
  fileOps.saveFile ( file, defaultLaobanJson )
}

export const defaultLaobanJson = `{
  "packageManager": "yarn",
  "parents":        [
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/core.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.publish.laoban.json"
  ]
}`