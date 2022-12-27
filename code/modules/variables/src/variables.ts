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
  regex: /(\$.*^)/g,
  removeStartEnd: ref => ref
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

function variableDefn ( options: DereferenceOptions | undefined ): VariableDefn {
  return options?.variableDefn ? options.variableDefn : dollarsBracesVarDefn;
}

/** If the string has ${a} in it, then that is replaced by the dic entry */
export function derefence ( context: string, dic: any, s: string, options?: DereferenceOptions ) {
  const regex = variableDefn ( options ).regex
  let groups = s.match ( regex )
  return groups ? groups.reduce ( ( acc, v ) => acc.replace ( v, replaceVar ( context, v, dic, options ) ), s ) : s;
}


export function findVar ( dic: any, ref: string ): any {
  if ( ref === undefined ) return undefined
  const parts = ref.split ( '.' )
  try {
    return parts.reduce ( ( acc, part ) => acc[ firstSegment ( part, ':' ) ], dic )
  } catch ( e ) {return undefined}
}
export function replaceVar ( context: string, ref: string, dic: any, options: DereferenceOptions | undefined ): string {
  const withoutStartEnd = variableDefn ( options ).removeStartEnd ( ref )
  const obj = findVar ( dic, withoutStartEnd )
  const last = lastSegment ( withoutStartEnd, '.' )
  const { result, error } = processVariable ( last, obj, options )
  if ( error !== undefined )
    if ( options?.throwError ) {throw new Error ( context + '\n' + safeArray ( error ).join ( ',' ) )} else
      return `//LAOBAN-UPDATE-ERROR ${context} ${error}. ref was ${ref}. Value was ${JSON.stringify ( obj )}`
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
export function processVariable ( nameWithCommands: string, value: any | undefined, options: DereferenceOptions | undefined ): ProcessedVariableResult {
  if ( value === undefined && options?.allowUndefined ) return { result: options?.undefinedIs }
  function error ( error: string | string[] ): ProcessedVariableResult {
    return { result: nameWithCommands, error }
  }
  if ( value === undefined ) return error ( 'no value found' )
  const parts = nameWithCommands.split ( ':' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
  if ( parts.length === 0 ) return { result: value }
  if ( parts.length === 1 ) return { result: value }
  const indent = findIndentString ( parts )
  if ( indent.error !== undefined ) return error ( indent.error )
  if ( parts.includes ( 'object' ) ) {
    return (typeof value === 'object') ? { result: toStringRemovingBraces ( value, indent.result ) } : error ( `Expected object but was of type ${typeof value} with value ${JSON.stringify ( value )}` )
  } else {
    return { result: value.toString () }
  }
}

function toStringRemovingBraces ( ref: any, indent: string ) {
  const result = JSON.stringify ( ref, null, 2 ).split ( "\n" );
  return result.slice ( 1, result.length - 1 ).map ( s => indent + s.substring ( 2 ) ).join ( '\n' )
}
