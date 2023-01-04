#!/usr/bin/env node
import { LaobanAdmin } from "./src/laoban-admin";
import { fileOps } from "@phil-rice/files";
import { shortCutFileOps, shortCuts } from "@phil-rice/utils";


try {

  const admin = new LaobanAdmin ( shortCutFileOps(fileOps, shortCuts), process.cwd (),process.env, process.argv )
  admin.start ()
} catch ( e ) {
  console.error ( e.message )
}
