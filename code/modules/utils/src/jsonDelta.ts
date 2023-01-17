import { mapObject } from "./utils";

export function jsonDelta ( original: any, data: any, onlyUpdate: boolean ): any {
  if ( typeof original === typeof data && typeof original === 'object' ) {
    return mapObject ( data, ( value, name ) => {
      const orig = original[ name ];
      if ( orig === undefined && onlyUpdate ) return undefined
      if ( typeof value === typeof orig && typeof value === 'object' ) {
        const result = jsonDelta ( orig, value, onlyUpdate );
        return Object.keys ( result ).length === 0 ? undefined : result;
      }
      if ( value === orig ) return undefined
      return value
    } )
  }
  return data
}
