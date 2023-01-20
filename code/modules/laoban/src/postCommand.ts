import { FileOps, fileOpsStats } from "@laoban/fileops";
import { GenerationsResult, isScriptResult, jsCount } from "./executors";
import { flatMap, toArray, toForwardSlash } from "@laoban/utils";

export function postCommand ( p: any, fileOps: FileOps ) {
  return <T> ( gensRess: T ) => {
    const errorDirs = flatMap ( toArray ( gensRess ), oneGen => flatMap ( toArray ( oneGen ), res => {
      if ( isScriptResult ( res ) ) {
        const hasError = res.results.some ( r => r.err !== null )
        return hasError ? [ fileOps.relative ( res.scd.scriptInContext.config.laobanDirectory, res.scd.detailsAndDirectory.directory ) ] : []
      }
      return []
    } ) )
    if ( errorDirs.length === 1 ) {
      console.log ( `${errorDirs[ 0 ]} has an error. To view log use` )
      console.log ( `   laoban log -p ${toForwardSlash ( errorDirs[ 0 ] )}$` )
    } else if ( errorDirs.length > 0 ) {
      console.log ( 'Multiple errors. To view logs use' )
      errorDirs.forEach ( dir => console.log ( `    laoban log -p ${toForwardSlash(dir)}$` ) )
    }
    if ( p.cachestats ) console.log ( `Cache stats ${JSON.stringify ( fileOpsStats ( fileOps ), null, 2 )}\n` )
    return gensRess
  }
}