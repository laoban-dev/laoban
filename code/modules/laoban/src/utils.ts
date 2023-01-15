//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { Writable } from "stream";
import { HasOutputStream } from "./config";
import { FileOps, fileOpsStats } from "@laoban/fileops";

export function postCommand ( p: any, fileOps: FileOps ) {
  return res => {
    if ( p.cachestats ) console.log ( `Cache stats ${JSON.stringify ( fileOpsStats ( fileOps ), null, 2 )}\n` )
    return res
  };
}
export function removeDuplicates<T> ( list: T[] ): T[] {
  return [ ...new Set ( list ) ]
}
export class Strings {
  static maxLength = ( ss: string[] ) => Math.max ( ...(ss.map ( s => s.length )) );
  static indentEachLine ( indent: string, lines: string ): string {
    return lines.split ( '\n' ).map ( s => indent + s ).join ( '\n' )
  }
}
export const output = ( c: HasOutputStream ): ( s: string ) => void =>
  s => { if ( !c.outputStream.writableEnded ) c.outputStream.write ( s + "\n" ) }

export function chain<From, To> ( decorators: (( fn: ( f: From ) => To ) => (( f: From ) => To))[] ): (( fn: ( f: From ) => To ) => (( f: From ) => To)) {
  return raw => decorators.reduce ( ( acc, v ) => v ( acc ), raw )
}

export function writeTo ( ws: Writable[], data: any ) {
  ws.forEach ( s => s.write ( data ) )
}

export interface StringAndWidth {
  value: string,
  width: number
}

export function groupBy<T> ( xs: T[], by: ( t: T ) => any ): { [ key: string ]: T[] } {
  return xs.reduce ( ( rv, x ) => {
    (rv[ by ( x ) ] = rv[ by ( x ) ] || []).push ( x );
    return rv;
  }, {} );
}


export var partition = function ( arr, length ) {
  var result = [];
  for ( var i = 0; i < arr.length; i++ ) {
    if ( i % length === 0 ) result.push ( [] );
    result[ result.length - 1 ].push ( arr[ i ] );
  }
  return result;
};
export class Maps {
  static add<K, V> ( map: Map<K, V[]>, k: K, v: V ) {
    let existing = map.get ( k )
    if ( existing ) {
      existing.push ( v )
    } else {
      map.set ( k, [ v ] )
    }
  }
  static addAll<K, V> ( map: Map<K, V[]>, k: K, vs: V[] ) {
    let existing = map.get ( k )
    if ( existing ) {
      vs.forEach ( v => existing.push ( v ) )
    } else {
      map.set ( k, [ ...vs ] )
    }
  }
}