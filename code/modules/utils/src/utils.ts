//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { safeArray } from "./safe";
import { fromEntries, mapObject, NameAnd } from "./nameAnd";

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


export function keep<K extends keyof T, T> ( obj: T, ...keys: K[] ): T {
  return fromEntries<T> ( ...flatMap<string, [ string, T ]> ( keys as string[], k => obj[ k ] ? [ [ k, obj[ k ] ] ] : [] ) ) as T
}

export const chain = <From, To> ( ...fns: (( from: From ) => To | undefined)[] ): ( from: From ) => To | undefined => ( from: From ) => {
  for ( let fn of fns ) {
    let result = fn ( from )
    if ( result !== undefined ) return result
  }
  return undefined
}

export function collect<T, T1> ( t: T[], filter: ( t: T ) => boolean, map: ( t: T ) => T1 ): T1[] {
  return t.filter ( filter ).map ( map )
}

export function flatten<T> ( t: T[][] ): T[] {
  return ([] as T[]).concat ( ...t )
}

export function flatMap<From, To> ( ts: From[], fn: ( from: From ) => To[] ): To[] {
  return flatten ( ts.map ( fn ) )
}

export function foldK<Acc, V> ( vs: V[], zero: Acc, foldFn: ( acc: Acc, v: V ) => Promise<Acc> ): Promise<Acc> {
  return vs.reduce ( async ( accP, v ) => accP.then ( acc => foldFn ( acc, v ) ), Promise.resolve ( zero ) )
}

export function mapK<V, To> ( vs: V[], fn: ( v: V ) => Promise<To> ): Promise<To[]> {
  return Promise.all<To> ( vs.map ( fn ) )
}

export function flatMapK<From, To> ( ts: From[], fn: ( from: From ) => Promise<To[]> ): Promise<To[]> {
  return mapK ( ts, fn ).then ( flatten )
}

export function objectSortedByKeys<T> ( o: NameAnd<T> ): NameAnd<T> {
  return Object.keys ( o ).sort ().reduce ( ( r, k ) => (r[ k ] = o[ k ], r), {} as NameAnd<T> );
}

export function objectSortedByKeysWithPriority<T> ( o: NameAnd<T>, ...priorityOrder: string[] ) {
  const priority = new Set ( priorityOrder );
  return Object.keys ( o ).sort ( ( a, b ) => {
    if ( priority.has ( a ) && priority.has ( b ) ) {
      return priorityOrder.indexOf ( a ) - priorityOrder.indexOf ( b );
    } else if ( priority.has ( a ) ) {
      return -1;
    } else if ( priority.has ( b ) ) {
      return 1;
    } else {
      return a.localeCompare ( b );
    }
  } ).reduce ( ( r, k ) => (r[ k ] = o[ k ], r), {} as NameAnd<T> );
}