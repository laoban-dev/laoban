//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import path from "path";
import { execFile } from "./executors";
import { emptyFileOps, FileOps, meteredFileOps } from "@laoban/fileops";
import { NullDebugCommands } from "@laoban/debug";
import { fileOpsStats, MeteredFileOps } from "@laoban/fileops/src/meteredFileOps";


export function streamNamefn ( sessionDir: string, sessionId: string, scriptName: string, directory: string ) {
  return path.join ( sessionDir,
    sessionId,
    directory.replace ( /\//g, '_' ) ) + '.' + scriptName + '.log'
}


describe ( "execFile i.e. file:", () => {
  async function execute ( command: string, alreadyExists: boolean ) {
    let msgs = []
    const logstream = { write ( msg: string ) { msgs.push ( msg ) } }
    const script: any = { details: { directory: 'dir', commandString: command }, scriptInContext: { debug: () => NullDebugCommands }, logStreams: [ logstream ] }
    const boolFn = () => Promise.resolve ( alreadyExists );
    const fileOps: MeteredFileOps = {
      ...meteredFileOps ( emptyFileOps ), isFile: boolFn, isDirectory: boolFn,
      loadFileOrUrl: ( fileName ) => {
        expect ( fileName ).toEqual ( 'dir/filename' );
        return Promise.resolve ( 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\nl11\nl12\nl13\nl14\nl15\nl16\nl17' );
      }
    }
    const result = await execFile ( fileOps ) ( script )
    return { fileOps, result, msgs }
  }
  it ( "rm", async () => {
    const command = 'file:rm(filename)';
    const { fileOps, result } = await execute ( command, true );
    expect ( result ).toEqual ( { "err": null } )
    expect ( fileOps.lastRemoveFile () ).toEqual ( 'dir/filename' )
  } )
  it ( "rmDir", async () => {
    const command = 'file:rmDir(theDir)';
    const { fileOps, result } = await execute ( command, true );
    expect ( result ).toEqual ( { "err": null } )
    expect ( fileOps.lastRemoveDirectory () ).toEqual ( 'dir/theDir' )
  } )
  it ( "mkdir", async () => {
    const command = 'file:mkdir(theDir)';
    const { fileOps, result } = await execute ( command, false );
    expect ( result ).toEqual ( { "err": null } )
    expect ( fileOps.lastCreatedDir () ).toEqual ( 'dir/theDir' )
  } )
  it ( "tail(filename)", async () => {
    const command = 'file:tail(filename)';
    const { fileOps, result, msgs } = await execute ( command, true );
    expect ( result ).toEqual ( { "err": null } )
    expect ( msgs ).toEqual ( [ "l8\nl9\nl10\nl11\nl12\nl13\nl14\nl15\nl16\nl17" ] )
  } )
  it ( "tail(filename,2)", async () => {
    const command = 'file:tail(filename,2)';
    const { fileOps, result, msgs } = await execute ( command, true );
    expect ( result ).toEqual ( { "err": null } )
    expect ( msgs ).toEqual ( [ "l16\nl17" ] )
  } )
  it ( "unknown command", async () => {
    const command = 'file:unknown(filename,2)';
    expect.assertions ( 1 );
    try {
     await execute ( command, true )
    } catch ( e ) {
      expect ( e.message ).toEqual ( "Unknown file command unknown. Common commands are 'rm' & 'rmDir'" )
    }
  } )
} )