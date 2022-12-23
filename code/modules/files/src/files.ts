import { promises } from "fs";
import { FileOps } from "@phil-rice/utils";
import fetch from 'node-fetch';
import { createHash } from "crypto";


function loadFile ( fileName: string ): Promise<string> {
  return promises.readFile ( fileName ).then ( buffer => buffer.toString ( 'utf-8' ) )
}
function loadUrl ( fileOrUrl: string ): Promise<string> {
  // console.log('in loadUrl', fileOrUrl)
  return fetch ( fileOrUrl ).then ( res => res.text () )
}

function loadFileOrUrl ( fileOrUrl: string ): Promise<string> {
  // console.log('in loadFileOrUrl', fileOrUrl)
  return fileOrUrl.includes ( "://" ) ? loadUrl ( fileOrUrl ) : loadFile ( fileOrUrl )
}
export const fileOps: FileOps = {
  digest: ( s: string ): string => {
    const hash = createHash ( 'sha256' );
    hash.update ( s );
    return hash.digest ( 'hex' );
  },
  loadFileOrUrl,
  createDir: dir => promises.mkdir ( dir, { recursive: true } ),
  saveFile: ( filename, text ) => promises.writeFile ( filename, text )
}