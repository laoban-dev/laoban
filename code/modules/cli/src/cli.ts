import { Action, ConfigAndIssues, ConfigOrReportIssues, ConfigWithDebug, PackageAction } from "@laoban/config";
import { addDebug } from "@laoban/debug";
import { postCommand } from "laoban/dist/src/postCommand";
import { FileOps } from "@laoban/fileops";
import { PackageDetailFiles } from "laoban/dist/src/Files";
import { Writable } from "stream";


export const displayError = ( outputStream: Writable ) => ( e: Error ) => {
  let chunk = (e.message ? e.message : e.toString ()).split ( '\n' ).slice ( 0, 2 ).join ( '\n' ) + "\n";
  if ( outputStream.writableEnded ) console.error ( chunk )
  else outputStream.write ( chunk );
}
export function command ( program: any, cmd: string, description: string, fns: (( a: any ) => any)[] ) {
  let p = program.command ( cmd ).description ( description )
  fns.forEach ( fn => p = fn ( p ) )
  return p
}

export interface ActionParams {
  program: any;
  configOrReportIssues: ConfigOrReportIssues;
  configAndIssues: ConfigAndIssues
  fileOps: FileOps
}
export function action<T> ( params: ActionParams, name: string, a: Action<T>, description: string, ...options: (( p: any ) => any)[] ) {
  const { program, configOrReportIssues, configAndIssues, fileOps } = params
  return command ( program, name, description, options )
    .action ( ( p1, p2, p3 ) => { // nightmare. p1,p2,p3 ... p1 might be passthruargs. It might not...
      const cmd = p3 ? p2 : p1
      const passThruArgs = p3 ? p1 : []
      return configOrReportIssues ( configAndIssues ).then ( addDebug ( cmd.debug, x => console.log ( '#', ...x ) ) )
        .then ( ( configWithDebug: ConfigWithDebug ) => a ( fileOps, { ...configWithDebug, passThruArgs: passThruArgs?.join ( " " ) }, cmd )
          .then ( postCommand ( program, fileOps ) )
          .catch ( displayError ( configWithDebug.outputStream ) ) );
    } )
}
export function packageAction<T> ( params: ActionParams, name: string, a: PackageAction<T>, description: string, ...options: (( p: any ) => any)[] ) {
  return action ( params, name, ( fileOps: FileOps, config: ConfigWithDebug, cmd: any ) =>
    PackageDetailFiles.workOutPackageDetails ( fileOps, config, cmd )
      .then ( pds => a ( config, cmd, pds ) )
      .catch ( displayError ( config.outputStream ) ), description, ...options )
}