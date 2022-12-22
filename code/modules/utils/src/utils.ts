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

export function mapObject<T, T1> ( a: NameAnd<T>, fn: ( t: T ) => T1 ): NameAnd<T1> {
  var result: NameAnd<T1> = {}
  Object.entries ( a ).forEach ( ( [ name, t ] ) => {
    let value = fn ( t );
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
  if ( ts === undefined ) return []
  if ( Array.isArray ( ts ) ) return ts
  return [ ts ];
}
export function safeObject<T> ( t: NameAnd<T> | undefined ): NameAnd<T> {
  return t === undefined ? {} : t
}
export function combineTwoObjects<T> ( t1: NameAnd<T> | undefined, t2: NameAnd<T> | undefined ): NameAnd<T> | undefined {
  return (t1 === undefined && t2 === undefined) ? undefined : { ...safeObject ( t1 ), ...safeObject ( t2 ) }
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


