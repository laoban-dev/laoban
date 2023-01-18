//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
export interface NameAnd<T> {
  [ name: string ]: T
}
export function unique<T> ( ts: T[] | undefined, tagFn: ( t: T ) => string ): T[] {
  const alreadyIn: Set<string> = new Set ()
  var result: T[] = []
  safeArray ( ts ).forEach ( t => {
    const tag = tagFn ( t );
    if ( !alreadyIn.has ( tag ) ) {
      result.push ( t );
      alreadyIn.add ( tag )
    }
  } )
  return result
}

export function mapObject<T, T1> ( a: NameAnd<T>, fn: ( t: T, name: string ) => T1 ): NameAnd<T1> {
  var result: NameAnd<T1> = {}
  Object.entries ( a ).forEach ( ( [ name, t ] ) => {
    let value = fn ( t, name );
    if ( value !== undefined ) result[ name ] = value
  } )
  return result
}

export function fromEntries<T> ( ...kvs: ([ string, T | undefined ])[] ): NameAnd<T> {
  var result: NameAnd<T> = {}
  kvs.forEach ( ( [ k, v ] ) => {if ( v !== undefined ) result[ k ] = v} )
  return result
}
export function mapObjectKeys<T, T1> ( a: NameAnd<T>, fn: ( name: string ) => T1 ): NameAnd<T1> {
  var result: NameAnd<T1> = {}
  Object.keys ( a ).forEach ( name => {
    let value = fn ( name );
    if ( value !== undefined )
      result[ name ] = value;
  } )
  return result
}

export function safeArray<T> ( ts: T | T[] | undefined ): T[] {
  if ( ts === undefined ||ts===null) return []
  if ( Array.isArray ( ts ) ) return ts
  return [ ts ];
}
export function safeObject<T> ( t: NameAnd<T> | undefined ): NameAnd<T> {
  return t === undefined ? {} : t
}
export function combineTwoObjects<T> ( t1: NameAnd<T> | undefined, t2: NameAnd<T> | undefined ): NameAnd<T> | undefined {
  return (t1 === undefined && t2 === undefined) ? undefined : { ...safeObject ( t1 ), ...safeObject ( t2 ) }
}
export function deepCombineTwoObjects ( t1: any, t2: any ): any {
  if ( t1 === undefined ) return t2
  if ( t2 === undefined ) return t1
  if ( typeof t1 !== 'object' ) return t2
  if ( typeof t2 !== 'object' ) return t2
  var result: any = { ...t1 }
  Object.entries ( t2 ).forEach ( ( [ k, v ] ) => {
    if ( t1[ k ] === undefined ) result[ k ] = v
    if ( Array.isArray ( t1[ k ] ) && Array.isArray ( v ) ) result[ k ] = t1[ k ].concat ( v ); else//
    if ( typeof v === 'object' && typeof t1[ k ] === 'object' ) result[ k ] = deepCombineTwoObjects ( t1[ k ], v ); else
      result[ k ] = v
  } )
  return result

}


export function arrayOrUndefinedIfEmpty<T> ( ts: T[] ): T[] | undefined {
  return ts.length === 0 ? undefined : ts;
}
export const removeEmptyArrays = <T> ( n: NameAnd<T[]> ): NameAnd<T[]> =>
  mapObject ( n, t => t === undefined || t.length === 0 ? undefined : t );

export const toArray = <T> ( t: undefined | T | T[] ): T[] => {
  if ( t === undefined ) return []
  if ( Array.isArray ( t ) ) return t
  return [ t ]
}
export const singleOrArrayOrUndefined = <T> ( ts:  T[] ): T | T[] | undefined => {
  if ( ts.length === 0 ) return undefined
  if ( ts.length === 1 ) return ts[ 0 ]
  return ts
}

export const chain = <From, To> ( ...fns: (( from: From ) => To | undefined)[] ): ( from: From ) => To | undefined => ( from: From ) => {
  for ( let fn of fns ) {
    let result = fn ( from )
    if ( result !== undefined ) return result
  }
  return undefined
}

export function flatten<T>(t: T[][]): T[] {
  return ([] as T[]).concat(...t)
}

export function flatMap<From,To>(ts: From[],fn: (from: From) => To[]): To[] {
  return flatten(ts.map(fn))
}