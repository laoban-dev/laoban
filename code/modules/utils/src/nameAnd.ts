import { mapK } from "./utils";

export interface NameAnd<T> {
  [ name: string ]: T
}
export function mapObject<T, T1> ( a: NameAnd<T>, fn: ( t: T, name: string ) => T1 ): NameAnd<T1> {
  var result: NameAnd<T1> = {}
  Object.entries ( a ).forEach ( ( [ name, t ] ) => {
    let value = fn ( t, name );
    if ( value !== undefined ) result[ name ] = value
  } )
  return result
}

export async function mapObjectK<T, T1> ( o: NameAnd<T>, fn: ( t: T, name: string ) => Promise<T1> ): Promise<NameAnd<T1>> {
  let result: [ string, T1 ][] = await mapK ( Object.entries ( o ), async ( [ name, t ] ) => [ name, await fn ( t, name ) ] )
  return fromEntries<T1> ( ...result )
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
export function mapObjectValues<T, T1> ( a: NameAnd<T>, fn: ( t: T ) => T1 ): NameAnd<T1> {
  var result: NameAnd<T1> = {}
  Object.entries ( a ).forEach ( ( [ name, value ] ) => {
    let newValue = fn ( value );
    if ( newValue !== undefined )
      result[ name ] = newValue;
  } )
  return result
}
export const removeEmptyArrays = <T> ( n: NameAnd<T[]> ): NameAnd<T[]> =>
  mapObject ( n, t => t === undefined || t.length === 0 ? undefined : t );