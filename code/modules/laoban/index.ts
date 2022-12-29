#!/usr/bin/env node
import { makeStandardCli } from "./src/laoban";
import { fileOps } from "@phil-rice/files";
import { makeCache } from "./src/configProcessor";


try {
  makeStandardCli ( fileOps, makeCache, process.stdout, process.argv ).then ( cli => cli.start () ).then ( () => {
    process.setMaxListeners ( 30 ) // because commander adds many listeners: at least one per option, and we have more than 10 options
  } )
} catch ( e ) {
  console.error ( e.message )
}
