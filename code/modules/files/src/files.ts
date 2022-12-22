import { promises } from "fs";
import { FileOps } from "@phil-rice/utils";
import { readFileSync } from "fs";
import fetch from 'node-fetch';


function loadFile ( fileName: string ): Promise<string> {
  return promises.readFile ( fileName ).then ( buffer => buffer.toString ( 'utf-8' ) )
}
function loadUrl ( fileOrUrl: string ): Promise<string> {
  return fetch ( fileOrUrl ).then ( res => res.json () ).then ( json => { return JSON.stringify ( json, null, 2 ); } )
}

function loadFileOrUrl ( fileOrUrl: string ): Promise<string> {
  return fileOrUrl.includes ( "://" ) ? loadUrl ( fileOrUrl ) : loadFile ( fileOrUrl )
}
export const fileOps: FileOps = {
  loadFileOrUrl,
  loadFileSync: fileName => readFileSync ( fileName ).toString ()
}