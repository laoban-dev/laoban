#!/usr/bin/env node
import { makeStandardCli } from "./src/laoban";

import { makeCache } from "./src/configProcessor";
import { fileOpsNode } from "@laoban/filesops-node";


try {
  makeStandardCli ( fileOpsNode, makeCache, process.stdout, process.argv ).then ( cli => cli.start () ).then ( () => {
    process.setMaxListeners ( 30 ) // because commander adds many listeners: at least one per option, and we have more than 10 options
  } )
} catch ( e ) {
  console.error ( e.message )
}
