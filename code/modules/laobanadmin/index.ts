#!/usr/bin/env node
import { LaobanAdmin } from "./src/laoban-admin";
import { fileOpsNode } from "@laoban/filesOps-node";
import { shortCutFileOps, shortCuts } from "@laoban/fileOps";


try {

  const admin = new LaobanAdmin ( shortCutFileOps(fileOpsNode, shortCuts), process.cwd (),process.env, process.argv )
  admin.start ()
} catch ( e ) {
  console.error ( e.message )
}
