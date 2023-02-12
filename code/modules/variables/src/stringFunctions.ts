import { NameAnd } from "@laoban/utils";


export const stringFunctions: NameAnd<( s: string, text: string ) => string> = {
  toLowerCase: s => s.toLowerCase (),
  toUpperCase: s => s.toUpperCase (),
  toTitleCase: s => s.replace ( /\w\S*/g, function ( txt ) {return txt.charAt ( 0 ).toUpperCase () + txt.substr ( 1 ).toLowerCase ();} ),
  toSnakeCase: s => s.replace ( /([a-z])([A-Z])/g, '$1_$2' ).toLowerCase (),
  "default": ( s, text ) => {
    if ( s !== undefined ) return s
    return text
  },
}