/** ref is like ${xxx} and this returns dic[xxx]. */
import { firstSegment, lastSegment, safeArray } from "@phil-rice/utils";

export interface VariableDefn {
  regex: RegExp
  removeStartEnd: ( s: string ) => string
}
export const dollarsBracesVarDefn: VariableDefn = {
  regex: /(\$\{[^}]*\})/g,
  removeStartEnd: ref => ref.slice ( 2, ref.length - 1 )
}
export const fulltextVariableDefn: VariableDefn = {
  regex: /(.*^)/g,
  removeStartEnd: ref => ref
}
export const mustachesVariableDefn: VariableDefn = {
  regex: /{{(.*)}}/g,
  removeStartEnd: ref => ref.slice ( 2, ref.length - 2 )
}
export const doubleXmlVariableDefn: VariableDefn = {
  regex: /<<([^>]*)>>/g,
  removeStartEnd: ref => ref.slice ( 2, ref.length - 2 )
}
interface ProcessedVariableResult {
  result: string
  error?: string | string[]
}

interface DereferenceOptions {
  allowUndefined?: true
  undefinedIs?: string
  throwError?: true
  variableDefn?: VariableDefn
}


/** If the string has ${a} in it, then that is replaced by the dic entry */
export function derefence ( context: string, dic: any, s: string, options?: DereferenceOptions ) {
  if ( options?.variableDefn === undefined ) return s;
  const regex = options.variableDefn.regex
  let groups: RegExpMatchArray = s.match ( regex )
  return s.replace ( regex, match => {
    let result = replaceVar ( context, match, dic, options );
    return result;
  } );
}


export function findVar ( dic: any, ref: string ): any {
  if ( ref === undefined ) return undefined
  const parts = ref.split ( '.' )
  try {
    return parts.reduce ( ( acc, part ) => acc[ firstSegment ( part, ':' ) ], dic )
  } catch ( e ) {return undefined}
}
export function replaceVar ( context: string, ref: string, dic: any, options: DereferenceOptions | undefined ): string {
  const withoutStartEnd = options.variableDefn.removeStartEnd ( ref )
  const obj = findVar ( dic, withoutStartEnd )
  const last = lastSegment ( withoutStartEnd, '.' )
  const { result, error } = processVariable ( context, dic, last, obj, options )
  if ( error !== undefined ) {
    if ( options?.throwError ) {throw new Error ( context + ` Ref is ${ref}\n` + safeArray ( error ).join ( ',' ) )} else
      return `//LAOBAN-UPDATE-ERROR ${context} for ref [${ref}]. ${error}. Value was ${JSON.stringify ( obj )}`
  }
  return result
}
function findIndentString ( parts: string[] ): ProcessedVariableResult {
  const indent = parts.find ( s => s.startsWith ( 'indent' ) );
  try {
    const indentValue = indent ? Number.parseInt ( indent.substring ( 6 ) ) : 0
    return { result: ''.padStart ( indentValue ) }
  } catch ( e ) {
    return { result: '', error: `Indent had illegal value ${indent}. Needs to be indentx where x is an integer` }
  }
}
export function processVariable ( context: string, dic: any, nameWithCommands: string, value: any | undefined, options: DereferenceOptions | undefined ): ProcessedVariableResult {
  function error ( error: string | string[] ): ProcessedVariableResult {
    return { result: nameWithCommands, error }
  }
  let mapIndex = nameWithCommands.indexOf ( ':map<<>>(' );
  if ( mapIndex >= 0 ) {
    if ( value === undefined || Array.isArray ( value ) ) {
      const realvalue = safeArray ( value )
      let commaIndex = nameWithCommands.indexOf ( 'comma' );
      const hasCommaRequest = commaIndex > 0 && commaIndex < mapIndex
      const comma = realvalue.length > 0 && hasCommaRequest ? ',' : ''
      const map = nameWithCommands.substring ( mapIndex + 8 )
      const mapParts: RegExpMatchArray = map.match ( /^\(([A-Za-z0-9]*)=>(.*)\)$/ )
      if ( mapParts === null ) return error ( `The mapFn was not of form '(variable=>strings)' it was ${map}` )
      const variable = mapParts[ 1 ]
      const mapFn = mapParts[ 2 ]

      const dirWithVar = { ...dic }
      const mapped = realvalue.map ( ( s, i ) => {
        dirWithVar[ variable ] = s
        let newContext = `${context} processing item ${i} in list [${s}]`;
        let result = derefence ( newContext, dirWithVar, mapFn, { ...options, variableDefn: doubleXmlVariableDefn } );
        return result;
      } )
      const result = mapped.toString () + comma
      return { result }
    } else
      return error ( `The value is not an array for a map<<>>` )
  }
  if ( value === undefined && options?.allowUndefined ) return { result: options?.undefinedIs }
  if ( value === undefined ) return error ( 'no value found' )

  const parts = nameWithCommands.split ( ':' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
  if ( parts.length === 0 ) return { result: value }
  if ( parts.length === 1 ) return { result: value }
  const indent = findIndentString ( parts )
  if ( indent.error !== undefined ) return error ( indent.error )
  if ( parts.includes ( 'object' ) ) {
    if ( typeof value !== 'object' ) return error ( `Expected object but was of type ${typeof value} with value ${JSON.stringify ( value )}` )
    const comma = parts.includes ( 'comma' ) && Object.keys ( value ).length > 0 ? ',' : ''
    return { result: toStringRemovingBraces ( value, indent.result ) + comma }
  } else {
    return { result: value.toString () }
  }
}


function toStringRemovingBraces ( ref: any, indent: string ) {
  const result = JSON.stringify ( ref, null, 2 ).split ( "\n" );
  return result.slice ( 1, result.length - 1 ).map ( s => indent + s.substring ( 2 ) ).join ( '\n' )
}
