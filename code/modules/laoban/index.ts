#!/usr/bin/env node
//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { makeStandardCli } from "./src/laoban";

import { makeCache } from "./src/configProcessor";
import { fileOpsNode } from "@laoban/filesops-node";
import { findVersionNumber } from "./src/Files";
import { LaobanAdmin } from "./src/admin/laoban-admin";
import { chainPostProcessFn, CopyFileOptions, defaultPostProcessors, shortCutFileOps, shortCuts } from "@laoban/fileops";
import { setOriginalEnv } from "./src/originalEnv";
import { postProcessForPackageJson } from "@laoban/node";
import { includeAndTransformFile } from "./src/update";




export function runLoabanAdmin ( newArgs: string[] ) {
  const admin = new LaobanAdmin ( shortCutFileOps ( fileOpsNode (), shortCuts ), process.cwd (), process.env, newArgs, process.stdout )
  return admin.start ()
}
export function runLoaban ( args: string[] ) {
  if ( args?.[ 2 ] === 'admin' ) {
    const newArgs = [ args[ 0 ], args[ 1 ], ...args.slice ( 3 ) ]
    return runLoabanAdmin ( newArgs );
  } else
    return makeStandardCli ( fileOpsNode (), makeCache, process.stdout, args ).then ( cli => cli.start () )
}

try {
  process.setMaxListeners ( 30 ) // because commander adds many listeners: at least one per option, and we have more than 10 options
  setOriginalEnv ()
  runLoaban ( process.argv )

} catch ( e ) {
  console.error ( e.message )
}