import path from "path";
import fs from "fs";
import * as cp from 'child_process'
import { findLaoban } from "./Files";
import os from "os";
import { makeStandardCli } from "./laoban";
import { Writable } from "stream";
import { fileOps } from "@laoban/files";
import { makeCache } from "./configProcessor";


export let testRoot = path.resolve ( findLaoban ( process.cwd () ), '..', 'tests', 'config'  );
export let fullPathsOfTestDirs = () => dirsIn ( 'test' ).map ( d => path.resolve ( d ) )
export let pwd = os.type () == 'Windows' ? 'echo %CD%' : 'pwd'

export function execute ( cwd: string, cmd: string ): Promise<string> {
  // console.log('execute', cwd, cmd)
  return new Promise<string> ( resolve => {
    cp.exec ( cmd, { cwd }, ( error, stdout, stdErr ) => {
      resolve ( (stdout.toString () + "\n" + stdErr).toString () )
    } )
  } )
}

function rememberWritable ( data: string[] ): Writable {
  return new Writable (
    {
      write ( chunk, encoding, callback ) {
        data.push ( chunk )
        callback ()
      }
    }
  )
}

interface RememberedDataAndStream {
  stream: Writable,
  promise: Promise<string[]>
}

export function executeCli ( cwd: string, cmd: string ): Promise<string> {
  let data: string[] = []
  let stream: Writable = rememberWritable ( data )
  let args: string[] = [ ...process.argv.slice ( 0, 2 ), ...cmd.split ( ' ' ).slice ( 1 ) ];
  return executeInChangedDirectory ( cwd, () => makeStandardCli ( fileOps, makeCache, stream, args ).then ( cli => cli.start () ).then ( () => data.join ( '' ) ) )
}


function executeInChangedDirectory<T> ( cwd: string, fn: () => Promise<T> ): Promise<T> {
  let start = process.cwd ()
  process.chdir ( cwd )
  return fn ().then ( ( res ) => {
    // console.log('res is', res, process.cwd())
    process.chdir ( start );
    return res
  } )
}
function streamToString ( stream ) {
  const chunks = []
  return new Promise ( ( resolve, reject ) => {
    stream.on ( 'data', chunk => chunks.push ( chunk ) )
    stream.on ( 'error', reject )
    stream.on ( 'end', () => resolve ( Buffer.concat ( chunks ).toString ( 'utf8' ) ) )
  } )
}

export function toArrayReplacingRoot ( s: string ): string[] {

  let rootMatch = new RegExp ( testRoot.replace ( /\\/g, "/" ), "g" )
  return s.split ( '\n' ).map ( s => s.replace ( /\\/g, "/" ).trim () ).map ( s => s.replace ( rootMatch, "<root>" ) ).filter ( s => s.length > 0 )
}


export function dirsIn ( root: string ) {
  return fs.readdirSync ( root ).//
    map ( testDirName => path.join ( testRoot, testDirName ) ).//
    filter ( d => fs.statSync ( d ).isDirectory () ).//
    map ( testDir => path.relative ( testRoot, testDir ) )

}
