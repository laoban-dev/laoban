import { Writable } from "stream";
import { WriteStream } from "fs";
import { CommandDefn, Envs, PackageDetailsAndDirectory, ScriptInContext, ScriptInContextAndDirectory, ScriptInContextAndDirectoryWithoutStream } from "./config";

export function isScriptResult ( r: any ): r is ScriptResult {
  return r.scd !== undefined && r.results !== undefined && r.duration !== undefined
}

export type  Generation = ScriptInContextAndDirectoryWithoutStream[]
export type  Generations = Generation[]
export type GenerationResult = ScriptResult[]
export type GenerationsResult = GenerationResult[]

export type RawCommandExecutor = ( d: ShellCommandDetails<CommandDetails> ) => Promise<RawShellResult>

export type ExecuteCommand = ( d: ShellCommandDetails<CommandDetails> ) => Promise<ShellResult[]>

export type ExecuteScript = ( s: ScriptInContextAndDirectoryWithoutStream ) => Promise<ScriptResult>
export type ExecuteScriptWithStreams = ( s: ScriptInContextAndDirectory ) => Promise<ScriptResult>


export type ExecuteGeneration = ( generation: Generation ) => Promise<GenerationResult>

export type ExecuteOneGeneration = ( generation: Generation ) => Promise<GenerationResult>

export type ExecuteGenerations = ( generations: Generations ) => Promise<GenerationsResult>

export interface ShellCommandDetails<Cmd> {
  scriptInContext: ScriptInContext,
  detailsAndDirectory: PackageDetailsAndDirectory
  details: Cmd
  outputStream: Writable
  logStreams: WriteStream[]  // The streams to write the output to
}

export interface CommandDetails {
  command: CommandDefn,
  dic: any, //All the things that can be used to deference variables
  env: Envs //The envs with their variables dereferenced
  directory: string, // the actual directory that the command will be executed in
  commandString: string
}

export interface RawShellResult {
  err: any
}
export interface ShellResult extends RawShellResult {
  details: ShellCommandDetails<CommandDetails>
  duration: number
}

export interface ScriptResult {
  scd: ScriptInContextAndDirectoryWithoutStream,
  results: ShellResult[],
  duration: number
}