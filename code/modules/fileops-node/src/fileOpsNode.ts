//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { promises, writeFileSync } from "fs";
import { createHash } from "crypto";
import { FileOps } from "@laoban/fileops";
import path from "path";
import { ProxyAgent } from 'proxy-agent';
import fetch, { RequestInit } from 'node-fetch'


const agent = new ProxyAgent ();


function loadFile ( fileName: string ): Promise<string> {
  return promises.readFile ( fileName ).then ( buffer => buffer.toString ( 'utf-8' ) )
}
function loadUrl ( fileOrUrl: string ): Promise<string> {
  const init: RequestInit = { agent }
  return fetch ( fileOrUrl, init ).then ( async res => {
    let text = await res.text ();
    if ( res.status >= 400 ) throw Error ( `Cannot load file [${fileOrUrl}] . Status is ${res.status}\n      Response was ${text}` )
    return text;
  }, error => {
    console.error ( error )
    throw error
  } )
}

function loadFileOrUrl ( fileOrUrl: string ): Promise<string> {
  return fileOrUrl.includes ( "://" ) ? loadUrl ( fileOrUrl ) : loadFile ( fileOrUrl )
}

export const fileOpsNode = ( speedUpLogs?: boolean ): FileOps => {
  const actualSpeedUpLogs = speedUpLogs !== false;
  return {
    isDirectory: filename => promises.lstat ( filename ).then ( s => s.isDirectory (), e => false ),
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
    log: ( filename, text ) => {
      const textWithNewLine = text + '\n';
      if ( actualSpeedUpLogs ) return promises.writeFile ( filename, textWithNewLine, { flag: 'a+' } )
      writeFileSync ( filename, textWithNewLine, { flag: 'a+' } ); // because logs want to be written 'right now'
      return Promise.resolve ()
    },
    listFiles: ( root: string ): Promise<string[]> => promises.readdir ( root ),
    removeDirectory: ( filename: string, recursive: boolean ): Promise<void> => promises.rm ( filename, { recursive, force: true } ),
    removeFile: ( filename: string ): Promise<void> => promises.rm ( filename, { force: true } ),
    join ( ...parts ): string {return path.join ( ...parts )},
    relative ( from: string, to: string ): string {return path.relative ( from, to )}
  }
}