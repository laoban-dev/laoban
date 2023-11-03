//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { HasOutputStream, ScriptInContextAndDirectory } from "@laoban/config";
import { output } from "./utils";
import { uniqueLoops } from "@laoban/generations";
import { topologicalSort, TopologicalSortTypeClasses } from "@laoban/generations";
import { Debug } from "@laoban/debug";
import { packageDetailsFile } from "./Files";
import { safeArray } from "@laoban/utils";


interface GenerationCalc {
  existing: string[],
  generations: string[][]
}

export function calculateAllGenerations ( scds: ScriptInContextAndDirectory[] ): GenerationCalc {
  return calcAllGenerationRecurse ( scds, { existing: [], generations: [] } )
}

export const typeClassForTopologicalSort = ( debug: Debug ): TopologicalSortTypeClasses<ScriptInContextAndDirectory> => ({
  debug,
  name: ( g: ScriptInContextAndDirectory ): string => g.detailsAndDirectory.packageDetails.name,
  children: ( g: ScriptInContextAndDirectory ): string[] => safeArray(g.detailsAndDirectory.packageDetails.links),
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
    let packageDetails = scd.detailsAndDirectory.packageDetails;
    if ( !packageDetails ) throw new Error ( `Cannot calculate generations as we have a directory without ${packageDetailsFile} [${scd.detailsAndDirectory.directory}]` )
    map.set ( packageDetails.name, scd )
  } )
  message ( () => [ 'keys in the map of names to projects', [ ...map.keys () ].sort () ] )
  if ( scds.length !== map.size )
    throw new Error ( `Cannot calculate generations: multiple projects with the same name
        ${scds.map ( scd => `${scd.detailsAndDirectory.directory} => ${scd.detailsAndDirectory.packageDetails.name}` ).join ( ', ' )}` );
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
  let missing = new Set ( scds.map ( p => p.detailsAndDirectory.packageDetails.name ) )
  gen.generations.forEach ( g => g.forEach ( n => missing.delete ( n ) ) )
  if ( missing.size > 0 ) {
    log ( '' )
    log ( "Missing: can't put in a generation" )
    log ( '  ' + [ ...missing ].sort ().join ( "," ) )
  }
}

function getChildrenRecurse ( pds: ScriptInContextAndDirectory[], existing: string[] ) {
  let thisTree = {}
  pds.forEach ( p => thisTree[ p.detailsAndDirectory.packageDetails.name ] = new Set ( p.detailsAndDirectory.packageDetails.links ) )
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
