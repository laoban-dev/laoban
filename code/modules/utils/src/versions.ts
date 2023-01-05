function clearVersion ( version: string ) {
  return version.replace ( /[^0-9.]/g, "" );
}

function getVersionArray ( version: string ): number[] {
  return clearVersion ( version ).split ( "." ).map ( ( v ) => parseInt ( v ) );
}

function compareVersions ( version1: number[], version2: number[] ): number {
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
  const ordered = vs.sort((a,b)=>compareVersions(getVersionArray(a),getVersionArray(b)))
  return ordered[ordered.length-1]
}