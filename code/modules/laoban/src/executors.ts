//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import * as cp from 'child_process'
import { CommandDefn, CommandDetails, Envs, ExecuteCommand, ExecuteGenerations, ExecuteOneGeneration, ExecuteScript, GenerationsResult, RawCommandExecutor, RawShellResult, ScriptInContextAndDirectoryWithoutStream, ScriptResult, ShellCommandDetails, ShellResult } from "@laoban/config";
import { cleanUpEnv } from "./configProcessor";
import * as path from "path";

import { chain, writeTo } from "./utils";
import { CommandDecorator } from "./decorators";
import { derefence, dollarsBracesVarDefn } from "@laoban/variables";
import { closeStream, firstSegment, flatten, NameAnd, safeArray } from "@laoban/utils";
import { FileOps, inDirectoryFileOps, Path } from "@laoban/fileops";
import fs, { WriteStream } from "fs";
import { Writable } from "stream";

export function execute ( cwd: string, cmd: string ): Promise<string> {
  // console.log('execute', cwd, cmd)
  return new Promise<string> ( resolve => {
    cp.exec ( cmd, { cwd, env: process.env }, ( error, stdout, stdErr ) => {
      resolve ( (stdout.toString () + "\n" + stdErr).toString () )
    } )
  } )
}



function calculateDirectory ( directory: string, command: CommandDefn ) { return (command.directory) ? path.join ( directory, command.directory ) : directory;}

export function streamNamefn ( path: Path, sessionDir: string, laobanDirectory: string, sessionId: string, scriptName: string, directory: string ) {
  const relativePath = path.relative ( laobanDirectory, directory )
  let paths = relativePath.replace ( /[\/\\.]/g, '_' ).replace ( /:/g, "" );
  let result = path.join ( sessionDir, sessionId, paths ) + '.log';
  return result
}
export function streamName ( path: Path, scd: ScriptInContextAndDirectoryWithoutStream ) {
  return streamNamefn ( path, scd.scriptInContext.config.sessionDir, scd.scriptInContext.config.laobanDirectory, scd.scriptInContext.sessionId, scd.scriptInContext.details.name, scd.detailsAndDirectory.directory )
}


export function buildShellCommandDetails ( scd: ScriptInContextAndDirectoryWithoutStream, outputStream: Writable, logStream: WriteStream ): ShellCommandDetails<CommandDetails>[] {
  return flatten ( scd.scriptInContext.details.commands.map ( cmd => {
    let directory = calculateDirectory ( scd.detailsAndDirectory.directory, cmd )
    function makeShellDetails ( link?: string ) {
      let dic = { ...scd.scriptInContext.config, packageDirectory: scd.detailsAndDirectory.directory, packageDetails: scd.detailsAndDirectory.packageDetails, link }
      let name = scd.scriptInContext?.details?.name;
      let env = cleanUpEnv ( `Script ${name}.env`, dic, scd.scriptInContext.details.env );
      let resultForOneCommand: ShellCommandDetails<CommandDetails> = {
        ...scd,
        logStreams: [ logStream ],
        outputStream,
        details: ({
          command: cmd,
          commandString: derefence ( `Script ${name}.commandString`, dic, cmd.command, { throwError: true, variableDefn: dollarsBracesVarDefn, allowUndefined: true } ),
          dic: dic,
          env: env,
          directory: derefence ( `Script ${name}.directory`, dic, directory, { throwError: true } ),
        })
      };
      return resultForOneCommand;
    }
    const links = safeArray ( scd.detailsAndDirectory?.packageDetails?.links )
    return cmd.eachLink ? links.map ( makeShellDetails ) : [ makeShellDetails () ]
  } ) )
}

export let executeOneGeneration: ( e: ExecuteScript ) => ExecuteOneGeneration = e => gen => Promise.all ( gen.map ( x => e ( x ) ) )

export function executeAllGenerations ( executeOne: ExecuteOneGeneration, reporter: ( GenerationResult ) => Promise<void> ): ExecuteGenerations {
  let fn = async ( gs, sofar ): Promise<GenerationsResult> => {
    if ( gs.length == 0 ) return sofar
    const res = await executeOne ( gs[ 0 ] )
    await reporter ( res )
    return await fn ( gs.slice ( 1 ), [ ...sofar, res ] )
  }
  return gs => fn ( gs, [] )
}


export let executeScript: ( path: Path, outputStream: Writable, e: ExecuteCommand ) => ExecuteScript =
             ( path, outputStream, e ) => async ( scd: ScriptInContextAndDirectoryWithoutStream ) => {
               let s = scd.scriptInContext.debug ( 'scripts' )
               s.message ( () => [ `execute script` ] )
               let startTime = new Date ().getTime ()
               const logStreamName = streamName ( path, scd );
               const logStream: WriteStream = fs.createWriteStream ( logStreamName )
               const results: ShellResult[][] = await executeOneAfterTheOther ( e ) ( buildShellCommandDetails ( scd, outputStream, logStream ) );
               await closeStream ( logStream )
               const duration = new Date ().getTime () - startTime;
               s.message ( () => [ `script ${logStream} executed in ${duration}ms` ] )
               const scriptResult: ScriptResult = { results: [].concat ( ...results ), scd, duration };
               return scriptResult
             }

function executeOneAfterTheOther<From, To> ( fn: ( from: From ) => Promise<To> ): ( froms: From[] ) => Promise<To[]> {
  return froms => froms.reduce ( ( res, f ) => res.then ( r => fn ( f ).then ( to => [ ...r, to ] ) ), Promise.resolve ( [] ) )
}



export function nameAndCommandExecutor ( lookup: NameAnd<RawCommandExecutor>, defaultExecutor: RawCommandExecutor ): RawCommandExecutor {
  return d => {
    let executorbyName = lookup[ firstSegment ( d.details.commandString, ':' ) ]
    const executor = executorbyName ? executorbyName : defaultExecutor
    return executor ( d );
  }
}

export function timeIt ( e: RawCommandExecutor ): ExecuteCommand {
  return d => {
    let startTime = new Date ()
    return e ( d ).then ( res => [ { ...res, details: d, duration: (new Date ().getTime () - startTime.getTime ()) } ] );
  }
}


export function decorateExecutor ( rawExecutor: RawCommandExecutor, timeIt: ( e: RawCommandExecutor ) => ExecuteCommand, ...decorators: CommandDecorator[] ): ExecuteCommand {
  let decorate = chain ( decorators )
  let decoratedShell = decorate ( timeIt ( rawExecutor ) )
  return c => { //TODO turn this into a decorator
    let s = c.scriptInContext.debug ( 'scripts' );
    return s.k ( () => `executing ${c.details.commandString} in ${c.detailsAndDirectory.directory}`, () => decoratedShell ( c ) );
  }
}

export let execInSpawn: RawCommandExecutor = ( d: ShellCommandDetails<CommandDetails> ) => {
  // console.log('in execInSpawn', d.details)
  let cwd = d.details.directory;
  let options = { cwd, env: { ...process.env, ...d.details.env } }

  //  let cwd = d.details.directory;
  //   let rawOptions = d.details.env ? { cwd: cwd, env: { ...process.env, ...d.details.env } } : { cwd: cwd }
  //   let options = {...rawOptions, env:{...rawOptions.env, cwd}}

  return new Promise<RawShellResult> ( ( resolve, reject ) => {
    //TODO refactor this so that the catch is just for the spawn
    try {
      let debug = d.scriptInContext.debug ( 'scripts' )
      debug.message ( () => [ `spawning ${d.details.commandString}. Options are ${JSON.stringify ( { ...options, env: undefined, shell: true } )}` ] )
      let child = cp.spawn ( d.details.commandString, { ...options, shell: true } )
      child.stdout.on ( 'data', data => writeTo ( d.logStreams, data ) )//Why not pipe? because the lifecycle of the streams are different
      child.stderr.on ( 'data', data => writeTo ( d.logStreams, data ) )
      child.on ( 'close', ( code ) => {resolve ( { err: code == 0 ? null : code } )} )
    } catch ( e ) {
      console.error ( e )
      reject ( Error ( `Error while trying to execute ${d.details.commandString} in ${d.detailsAndDirectory.directory}\n\nError is ${e}` ) )
    }
  } )
}

//** The function passed in should probably not return a promise. The directory is changed, the function executed and then the directory is changed back
function executeInChangedDir<To> ( dir: string, block: () => To ): To {
  let oldDir = process.cwd ()
  try {
    process.chdir ( dir );
    return block ()
  } finally {process.chdir ( oldDir )}
}
//** The function passed in should probably not return a promise. The env is changed, the function executed and then the env changed back
function executeInChangedEnv<To> ( env: Envs, block: () => To ): To {
  let oldEnv = process.env
  try {
    if ( env ) process.env = env;
    return block ()
  } finally {process.env = oldEnv}
}

export let jsCount = 0
export let execJS: RawCommandExecutor = d => {
  jsCount += 1
  // console.log('in execJs',process.cwd(),d.details.directory, d.details.commandString)
  try {
    let res = executeInChangedEnv<any> ( d.details.env, () => executeInChangedDir ( d.details.directory,
      () => Function ( "return  " + d.details.commandString.substring ( 3 ) ) ().toString () ) )
    let result = res.toString ();
    // console.log('result from execJS', d.detailsAndDirectory.directory,result, 'logStreams', d.logStreams.length)
    writeTo ( d.logStreams, result + '\n' )
    return Promise.resolve ( { err: null } )
  } catch ( e ) {
    let result = `Error: ${e} Command was [${d.details.commandString}]`;
    writeTo ( d.logStreams, result + '\n' )
    return Promise.resolve ( { err: e } )
  }
}
async function executeCommand ( fileOpsWithDir: FileOps, d: ShellCommandDetails<CommandDetails>, fullFileName: string, command: string ) {
  async function removeFileCommand () {
    if ( await fileOpsWithDir.isFile ( fullFileName ) ) {
      await fileOpsWithDir.removeFile ( fullFileName )
    }
  }
  async function removeDirCommand () {
    if ( await fileOpsWithDir.isDirectory ( fullFileName ) )
      await fileOpsWithDir.removeDirectory ( fullFileName, true ).catch ( () => {} )
  }
  async function createDirCommand () {
    if ( !(await fileOpsWithDir.isDirectory ( fullFileName )) )
      await fileOpsWithDir.createDir ( fullFileName )
  }
  async function catCommand () {
    if ( await fileOpsWithDir.isFile ( fullFileName ) )
      writeTo ( d.logStreams, await fileOpsWithDir.loadFileOrUrl ( fullFileName ) )
  }
  async function tailCommand () {
    const parts = fullFileName.split ( ',' )
    if ( parts.length === 0 ) return

    function number () {
      try {return parseInt ( parts[ 1 ] )} catch ( e ) {
        (console.error ( `malformed number in tail command ${fullFileName}` ), 0)
      }
    }

    const realFileName = parts[ 0 ]
    const tailSize = parts.length === 1 ? 10 : number ()

    if ( await fileOpsWithDir.isFile ( realFileName ) ) {
      try {
        const file = await fileOpsWithDir.loadFileOrUrl ( realFileName )
        const lines = file.split ( '\n' )
        const result = lines.slice ( -tailSize ).join ( '\n' );
        writeTo ( d.logStreams, result )
      } catch ( e ) {
        console.log ( `Cannot find file ${fullFileName}` )
      }
    }
  }

  async function removeLogCommand () {
    d.logStreams.forEach ( s => s.end () )
    await fileOpsWithDir.removeFile ( '.log' )
  }
  if ( command === 'rm' ) await removeFileCommand ();
  else if ( command === 'rmDir' ) await removeDirCommand ();
  else if ( command === 'tail' ) await tailCommand ();
  else if ( command === 'rmLog' ) await removeLogCommand ();
  else if ( command === 'mkdir' ) await createDirCommand ();
  else if ( command === 'cat' ) await catCommand ();
  else throw new Error ( `Unknown file command ${command}. Common commands are 'rm','rmDir', 'tail', 'cat'` )
}


export const execFile = ( fileOps: FileOps ): RawCommandExecutor =>
  async d => {
    const debug = d.scriptInContext.debug ( 'files' )
    const fileOpsWithDir = inDirectoryFileOps ( fileOps, d.details.directory )
    const regex = /^file:(\w+)\s*\(([^\)]*)\)$/
    const match = d.details.commandString.match ( regex )
    if ( !match ) throw Error ( `Command [${d.details.commandString}] does not match 'file:command(value)'` )
    const command = match[ 1 ]
    const filename = match[ 2 ]
    await debug.k ( () => `file: ${command} ${filename}`, () => executeCommand ( fileOpsWithDir, d, filename, command ) );
    return { err: null }
  }
