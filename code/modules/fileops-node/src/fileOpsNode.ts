import { promises } from "fs";
import fetch from 'node-fetch';
import { createHash } from "crypto";
import { FileOps } from "@laoban/fileops";
import path from "path";


function loadFile ( fileName: string ): Promise<string> {
  return promises.readFile ( fileName ).then ( buffer => buffer.toString ( 'utf-8' ) )
}
function loadUrl ( fileOrUrl: string ): Promise<string> {
  return fetch ( fileOrUrl ).then ( async res => {
    let text = await res.text ();
    if ( res.status >= 400 ) throw Error ( `Cannot load file ${fileOrUrl}. Status is ${res.status}\n      Response was ${text}` )
    return text;
  }, error => {
    console.error ( error )
    throw error
  } )
}

function loadFileOrUrl ( fileOrUrl: string ): Promise<string> {
  return fileOrUrl.includes ( "://" ) ? loadUrl ( fileOrUrl ) : loadFile ( fileOrUrl )
}
export const fileOpsNode: FileOps = {
  isDirectory: filename => promises.lstat ( filename ).then ( s =>
      s.isDirectory (), e => false ),
  isFile: filename => promises.lstat ( filename ).then ( s =>
    s.isFile (), e => false ),
  digest: ( s: string ): string => {
    const hash = createHash ( 'sha256' );
    hash.update ( s );
    return hash.digest ( 'hex' );
  },
  loadFileOrUrl,
  createDir: dir => promises.mkdir ( dir, { recursive: true } ),
  saveFile: ( filename, text ) => promises.writeFile ( filename, text ),
  listFiles: ( root: string ): Promise<string[]> => promises.readdir ( root ),
  removeDirectory: ( filename: string, recursive: boolean ): Promise<void> => promises.rm ( filename, { recursive, force: true } ),
  join ( ...parts ): string {return path.join ( ...parts )}
}