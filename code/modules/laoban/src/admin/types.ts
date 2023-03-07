import { CopyFileOptions, FileOps, FileOpsAndXml } from "@laoban/fileops";
import { Writable } from "stream";

export interface ShortActionParams<Cmd> {
  fileOpsAndXml: FileOpsAndXml,
  currentDirectory: string,
  cmd: Cmd,

}
export interface ActionParams<Cmd> extends ShortActionParams<Cmd> {
  params: string[],
  outputStream: Writable
  copyOptions: CopyFileOptions
}
