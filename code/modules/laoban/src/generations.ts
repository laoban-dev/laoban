import { HasOutputStream, ScriptInContextAndDirectory } from "./config";
import { output } from "./utils";
import { uniqueLoops } from "@laoban/generations";
import { topologicalSort, TopologicalSortTypeClasses } from "@laoban/generations";
import { Debug } from "@laoban/debug";


interface GenerationCalc {
  existing: string[],
  generations: string[][]
}

export function calculateAllGenerations ( scds: ScriptInContextAndDirectory[] ): GenerationCalc {
  return calcAllGenerationRecurse ( scds, { existing: [], generations: [] } )
}

export const typeClassForTopologicalSort = ( debug: Debug ): TopologicalSortTypeClasses<ScriptInContextAndDirectory> => ({
  debug,
  name: ( g: ScriptInContextAndDirectory ): string => g.detailsAndDirectory.projectDetails.name,
  children: ( g: ScriptInContextAndDirectory ): string[] => g.detailsAndDirectory.projectDetails.details.links,
  loopMessage: ( gs, loops ) => {
    const message = uniqueLoops ( loops ).map ( l => `  ${l.join ( ' -> ' )}` ).join ( "\n" )
    throw Error ( `Cannot work out the 'order' for the project. There are 'cycles' in the project links:\n${message}` );
  }
})


export const splitGenerationsByLinksUsingGenerations = ( debug: Debug ): ( gs: ScriptInContextAndDirectory[] ) => ScriptInContextAndDirectory[][] =>
  topologicalSort ( typeClassForTopologicalSort ( debug ) )


export const splitGenerationsByLinks = ( debug: Debug ) => ( scds: ScriptInContextAndDirectory[] ): ScriptInContextAndDirectory[][] => {
  let map = new Map<string, ScriptInContextAndDirectory> ()
  const message = debug ( 'scripts' ).message
  scds.forEach ( scd => {
    let projectDetails = scd.detailsAndDirectory.projectDetails;
    if ( !projectDetails ) throw new Error ( `Cannot calculate generations as we have a directory without project.details.json [${scd.detailsAndDirectory.directory}]` )
    map.set ( projectDetails.name, scd )
  } )
  message ( () => [ 'keys in the map of names to projects', [ ...map.keys () ].sort () ] )
  if ( scds.length !== map.size )
    throw new Error ( `Cannot calculate generations: multiple projects with the same name
        ${scds.map ( scd => `${scd.detailsAndDirectory.directory} => ${scd.detailsAndDirectory.projectDetails.name}` ).join ( ', ' )}` );
  if ( scds.length !== map.size ) throw new Error ( 'Cannot calculate generations: multiple projects with the same name' )
  let genNames = calculateAllGenerations ( scds ).generations
  message ( () => [ 'genNames', ...genNames ] )
  return genNames.map ( names => names.map ( n => map.get ( n ) ) )

};

export function calcAllGenerationRecurse ( scds: ScriptInContextAndDirectory[], start: GenerationCalc ): GenerationCalc {
  let newGen = getChildrenRecurse ( scds, start.existing )
  if ( newGen.length == 0 ) return start;
  return calcAllGenerationRecurse ( scds, { existing: [ ...start.existing, ...newGen ], generations: [ ...start.generations, newGen ] } )
}
export function prettyPrintGenerations ( hasStream: HasOutputStream, scds: ScriptInContextAndDirectory[], gen: GenerationCalc ) {
  let log = output ( hasStream )
  gen.generations.forEach ( ( g, i ) => {
    log ( `Generation ${i}` )
    log ( '  ' + g.join ( ", " ) )
  } )
  let missing = new Set ( scds.map ( p => p.detailsAndDirectory.projectDetails.name ) )
  gen.generations.forEach ( g => g.forEach ( n => missing.delete ( n ) ) )
  if ( missing.size > 0 ) {
    log ( '' )
    log ( "Missing: can't put in a generation" )
    log ( '  ' + [ ...missing ].sort ().join ( "," ) )
  }
}

function getChildrenRecurse ( pds: ScriptInContextAndDirectory[], existing: string[] ) {
  let thisTree = {}
  pds.forEach ( p => thisTree[ p.detailsAndDirectory.projectDetails.name ] = new Set ( p.detailsAndDirectory.projectDetails.details.links ) )
  for ( let k in thisTree ) {
    if ( existing.includes ( k ) ) delete thisTree[ k ]
    else {
      let values = thisTree[ k ]
      existing.forEach ( e => values.delete ( e ) )
    }
  }
  for ( let k in thisTree ) {
    if ( thisTree[ k ].size > 0 )
      delete thisTree[ k ]
  }
  return [ ...Object.keys ( thisTree ) ].sort ()
}
