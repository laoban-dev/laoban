import { CopyFileOptions, FileOps } from "@laoban/fileops";
import { Writable } from "stream";

export interface ShortActionParams<Cmd> {
  fileOps: FileOps,
  currentDirectory: string,
  cmd: Cmd,

}
export interface ActionParams<Cmd> extends ShortActionParams<Cmd> {
  params: string[],
  outputStream: Writable
  copyOptions: CopyFileOptions
}
