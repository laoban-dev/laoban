function clearVersion ( version: string ) {
  return version.replace ( /[^0-9.]/g, "" );
}

function getVersionArray ( version: string ): number[] {
  return clearVersion ( version ).split ( "." ).map ( ( v ) => parseInt ( v ) );
}

export function compareVersionNumbers ( version1: number[], version2: number[] ): number {
  const length = Math.max ( version1.length, version2.length );
  for ( let i = 0; i < length; i++ ) {
    const v1 = version1[ i ] || 0;
    const v2 = version2[ i ] || 0;
    if ( v1 < v2 ) return -1;
    if ( v1 > v2 ) return 1;
  }
  return 0;
}

export function findHighestVersion(vs: string[]){
  if (vs.length === 0) return undefined;
  const ordered = vs.sort((a,b)=>compareVersionNumbers(getVersionArray(a),getVersionArray(b)))
  return ordered[ordered.length-1]
}
export function nextVersion(version: string){
  const regex = /(\d+)/g
  const match = version.match(regex)
  if (!match) throw new Error ( `Could not find a number in version ${version}` )
  const index = match.length-1
  let i = 0
  return version.replace(regex, match => i++ === index ? (parseInt ( match ) + 1).toString () : match)
}
export function nextMajorVersion(version: string){
  const regex = /(\d+)/g
  const match = version.match(regex)
  if (!match) throw new Error ( `Could not find a number in version ${version}` )
  if (match.length < 2) throw new Error ( `Could not find a major version in version ${version}` )
  let numbers = getVersionArray(version).slice(0,2);
  numbers[1] = numbers[1] + 1
  return numbers.join(".") + ".0"
}