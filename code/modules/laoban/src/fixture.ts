//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import path from "path";
import fs from "fs";
import * as cp from 'child_process'
import { findLaoban } from "./Files";
import os from "os";
import { makeStandardCli } from "./laoban";
import { Writable } from "stream";

import { makeCache } from "./configProcessor";
import { fileOpsNode } from "@laoban/filesops-node";
import { fastXmlParser } from "@laoban/fast-xml-parser";


export let testRoot = path.resolve ( findLaoban ( process.cwd () ), '..', 'tests' );
export let configTestRoot = path.resolve ( testRoot, 'config' );
export let fullPathsOfTestDirs = () => dirsIn ( 'test' ).map ( d => path.resolve ( d ) )
export let pwd = os.type () == 'Windows' ? 'echo %CD%' : 'pwd'
const fileOps = fileOpsNode ();


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
  const fileOpsAndXml = { fileOps, xml: fastXmlParser };
  return executeInChangedDirectory ( cwd, () => makeStandardCli ( fileOpsAndXml, makeCache, stream, args ).then ( cli => cli.start () ).then ( () => data.join ( '' ) ) )
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

export function toArrayReplacingRoot ( testRoot: string, s: string ): string[] {
  let rootMatch = new RegExp ( testRoot.replace ( /\\/g, "/" ), "g" )
  return s.split ( '\n' ).map ( s => s.replace ( /\\/g, "/" ).trim () )
    .map ( s => s.replace ( rootMatch, "<root>" ) ).filter ( s => s.length > 0 )
}


export function dirsIn ( root: string ) {
  return fs.readdirSync ( root ).//
    map ( testDirName => path.join ( configTestRoot, testDirName ) ).//
    filter ( d => fs.statSync ( d ).isDirectory () ).//
    map ( testDir => path.relative ( configTestRoot, testDir ) )

}
