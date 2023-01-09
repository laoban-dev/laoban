let pathMarker = /[\/\\]/g;
export function lastSegment ( s: string, marker: string | RegExp = pathMarker ) {
  if ( s === undefined ) return undefined
  const parts = s.split ( marker )
  if ( parts.length === 0 ) return s
  return parts[ parts.length - 1 ]
}
export function firstSegment ( s: string, marker: string | RegExp =pathMarker ) {
  if ( s === undefined ) return undefined
  const parts = s.split ( marker )
  if ( parts.length === 0 ) return s
  return parts[ 0 ]
}
