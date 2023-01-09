//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { findAllLoopsFor, RawLoops } from "./cyclicGraphDetection";
import { fromEntries, NameAnd, safeArray } from "@laoban/utils";
import { Debug } from "@laoban/debug";

export type NameViewOfGraph = NameAnd<string[]>

export interface TopologicalSortTypeClasses<G> {
  debug: Debug,
  name: ( g: G ) => string,
  children: ( g: G ) => string[] | undefined,
  loopMessage: ( gs: G[], view: RawLoops ) => G[][] //will usually throw an exception but can do anything
}


export const mapGraphToNameView = <G> ( tc: TopologicalSortTypeClasses<G> ) => ( nodes: G[] ): NameViewOfGraph =>
  fromEntries<string[]> ( ...(nodes.map ( ( node: G ): [ string, string[] ] => [ tc.name ( node ), tc.children ( node ) ] )) )

export const mapGraphToNameMap = <G> ( tc: TopologicalSortTypeClasses<G> ) => ( nodes: G[] ): NameAnd<G> =>
  fromEntries<G> ( ...nodes.map ( ( node: G ): [ string, G ] => [ tc.name ( node ), node ] ) )

type GenerationNames = string[][]
type TopologicalSortAcc = NameAnd<number>


const foldIntoAcc = ( graph: NameViewOfGraph ) => ( acc: TopologicalSortAcc, name: string ): TopologicalSortAcc => {
  const existing = acc[ name ]
  if ( existing !== undefined ) return acc
  const result = { ...acc }
  function fold ( parent: string, gen: number ) {
    const parentGeneration = acc[ parent ]
    if ( parentGeneration === undefined || gen > parentGeneration ) { // if the child hasn't been visited, or if the existing generation is not big enough
      result[ parent ] = gen
      const children = safeArray ( graph[ parent ] );
      children.forEach ( gc => fold ( gc, gen + 1 ) )
    }
  }
  fold ( name, 0 )
  return result
}
export const topologicalSortNames = ( graph: NameAnd<string[]> ): GenerationNames => {
  const fold = foldIntoAcc ( graph )
  const nameToGeneration = Object.keys ( graph ).reduce ( fold, {} )
  var result: string[][] = []
  function addToGeneration ( [ name, gen ]: [ string, number ] ) {
    const existing = result[ gen ]
    if ( existing === undefined ) result[ gen ] = []
    result[ gen ].push ( name )
  }
  Object.entries ( nameToGeneration ).forEach ( addToGeneration )
  return result
}

export const topologicalSort = <G> ( tc: TopologicalSortTypeClasses<G> ) => ( nodes: G[] ): G[][] => {
  const stringGraph: NameAnd<string[]> = mapGraphToNameView ( tc ) ( nodes )
  const debug = tc.debug ( 'link' )
  const nameMap = mapGraphToNameMap ( tc ) ( nodes )
  debug.message ( () => [ `topologicalSort - nameMap`, nameMap ] )
  const loops = findAllLoopsFor ( stringGraph )
  debug.message ( () => [ `topologicalSort - loops`, loops ] )
  if ( Object.keys ( loops ).length > 0 ) return tc.loopMessage ( nodes, loops )
  const generationNames = topologicalSortNames ( stringGraph )
  debug.message ( () => [ `topologicalSort - generationNames`, generationNames ] )
  return generationNames.map ( gen => gen.filter ( g => nameMap[ g ] !== undefined ).map ( name => nameMap[ name ] ) ).reverse ().filter(gs => gs.length>0)
}