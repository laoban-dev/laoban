import { mapObject } from "./nameAnd";


export interface JsonDeltaOptions {
  onlyUpdate?: boolean;
  showDiff?: ( orig: any, updated: any ) => string;
}

export function jsonDelta ( original: any, data: any, options: JsonDeltaOptions ): any {
  const { onlyUpdate, showDiff } = options
  if ( typeof original === typeof data && typeof original === 'object' ) {
    return mapObject ( data, ( value, name ) => {
      const orig = original[ name ];
      if ( orig === undefined && onlyUpdate ) return undefined
      if ( typeof value === typeof orig && typeof value === 'object' ) {
        const result = jsonDelta ( orig, value, options );
        return Object.keys ( result ).length === 0 ? undefined : result;
      }
      if ( value === orig ) return undefined
      return showDiff ? showDiff ( orig, value ) : value
    } )
  }
  return data
}
