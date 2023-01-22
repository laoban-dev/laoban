//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { GenerationResult, streamName } from "./executors";
import { ScriptInContextAndDirectoryWithoutStream } from "./config";
import { Writable } from "stream";
import { output } from "./utils";
import { FileOps } from "@laoban/fileops";

type GenerationReporter = ( gen: GenerationResult ) => Promise<void>
async function reporter ( fileOps: FileOps, outputStream: Writable, gen: GenerationResult, reportDecorator: ReportDecorator ): Promise<void> {
  let log = output ( { outputStream } );
  if ( gen.length === 0 ) return
  for ( let scriptRes of gen ) {
    const filename = streamName ( fileOps, scriptRes.scd );
    let report: Report = { scd: scriptRes.scd, text: await fileOps.loadFileOrUrl ( filename ) }
    let message = reportDecorator ( report ).text;
    if ( message.length > 0 ) log ( message.trimRight () )
    if (scriptRes.scd.scriptInContext.shell) log('')
  }
}
//   const report = reportDecorator ( gen );
//   let result = Promise.all ( gen.map ( ( sr, i ) => {
//     if ( gen.length > 0 ) {
//       let report = { scd: gen[ 0 ].scd, text: fse.readFileSync ( logFile ).toString () }
//       let message = reportDecorator ( report ).text;
//       if ( message.length > 0 ) log ( message.trimRight () )
//     }
//
//     return Promise.all ( sr.scd.streams.map ( s => new Promise<string> ( ( resolve, reject ) => {
//       sr.scd.logStream.on ( 'finish', () => resolve ( logFile ) )
//     } ) ) ).then ( () => logFile )
//   } ) ).then ( fileNames => fileNames.map ( logFile => {
//     if ( gen.length > 0 ) {
//       let report = { scd: gen[ 0 ].scd, text: fse.readFileSync ( logFile ).toString () }
//       let message = reportDecorator ( report ).text;
//       if ( message.length > 0 ) log ( message.trimRight () )
//     }
//   } ) )
//   gen.forEach ( sr => sr.scd.streams.forEach ( s => s.end () ) )
//   return result.then ( () => {} )
// }

interface Report {
  scd: ScriptInContextAndDirectoryWithoutStream,
  text: string
}

type ReportDecorator = ( report: Report ) => Report

const prefixLinesThatDontStartWithStar = ( s: string ) => s.split ( '\n' ).map ( s => s.startsWith ( '*' ) ? s : '  ' + s ).join ( '\n' );

const shellReportDecorator: ReportDecorator = report =>
  report.scd.scriptInContext.shell || report.scd.scriptInContext.details.showShell ?
    { ...report, text: prefixLinesThatDontStartWithStar ( report.text ) } :
    report;

const quietDecorator: ReportDecorator = report => report.scd.scriptInContext.quiet ? { ...report, text: '' } : report

function chainReports ( decorators: ReportDecorator[] ): ReportDecorator {return report => decorators.reduce ( ( acc, r ) => r ( acc ), report )}
const reportDecorators: ReportDecorator = chainReports ( [ shellReportDecorator, quietDecorator ] )

export const shellReporter: ( fileOps: FileOps, outputStream: Writable ) => GenerationReporter =
               ( fileOps, outputStream: Writable ) => async ( gen: GenerationResult ) =>
                 reporter ( fileOps, outputStream, gen, reportDecorators )