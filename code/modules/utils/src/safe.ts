import { NameAnd } from "./nameAnd";

export function safeArray<T> ( ts: T | T[] | undefined ): T[] {
  if ( ts === undefined || ts === null ) return []
  if ( Array.isArray ( ts ) ) return ts
  return [ ts ];
}
export function stringOrUndefinedAsString ( s: string | undefined ): string {
  return s === undefined ? 'undefined' : s
}
export function safeObject<T> ( t: NameAnd<T> | undefined ): NameAnd<T> {
  return t === undefined ? {} : t
}
export const toArray = <T> ( t: undefined | T | T[] ): T[] => {
  if ( t === undefined ) return []
  if ( Array.isArray ( t ) ) return t
  return [ t ]
}
export const singleOrArrayOrUndefined = <T> ( ts: T[] ): T | T[] | undefined => {
  if ( ts.length === 0 ) return undefined
  if ( ts.length === 1 ) return ts[ 0 ]
  return ts
}
export function arrayOrUndefinedIfEmpty<T> ( ts: T[] ): T[] | undefined {
  return ts.length === 0 ? undefined : ts;
}