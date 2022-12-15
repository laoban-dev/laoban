import { promises } from "fs";
import { FileOps } from "@phil-rice/utils";
import {readFileSync}  from "fs";




export const fileOps: FileOps = {
  loadFile: fileName => promises.readFile ( fileName ).then ( buffer => buffer.toString ( 'utf-8' ) ),
  loadFileSync: fileName => readFileSync ( fileName ).toString()
  }