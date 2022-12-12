import { mapObjectKeys, NameAnd, removeEmptyArrays, safeArray, unique } from "@phil-rice/utils";

var flatMap = require ( 'array.prototype.flatmap' )

type ChildNames = NameAnd<string[] | undefined>
export type RawLoops = NameAnd<string[][]>

const findLoopsFor = ( cn: ChildNames, path: string[] ) => ( name: string ): string[][] => {
  if ( path.includes ( name ) ) return [ [ ...path, name ] ]
  return flatMap ( safeArray ( cn[ name ] ), findLoopsFor ( cn, [ ...path, name ] ) )
};

export function cannonicalLoop ( path: string[] ) {
  if ( path.length === 0 ) return []
  const lowest = [ ...path ].sort ()[ 0 ]
  const index = path.findIndex ( p => p === lowest )
  const pathWithoutEnd = path.slice ( 0, path.length - 1 )
  let core = [ ...pathWithoutEnd, ...pathWithoutEnd ].slice ( index, index + path.length - 1 );
  return [ ...core, lowest ]
}


export function removeIfSuperLoop ( loops: string[][] ) {
  const allLoops = loops.map ( l => l.join ( '.' ) )
  function isInSuperSet ( loop: string[] ): boolean {
    const s = loop.join ( "." )
    let allLoopsWithoutS = allLoops.filter ( al => al !== s );
    const indexOfChild = allLoopsWithoutS.findIndex ( al => s.includes ( al ) )
    let hasChild = indexOfChild !== -1;
    // console.log(`evaluating if ${s} is a child of ${allLoopsWithoutS.join(",")}`, indexOfChild, hasChild)
    return hasChild
  }
  // console.log ( 'allLoops', allLoops )
  return loops.filter ( loop => !isInSuperSet ( loop ) )
}
export function removeIfSamePath ( loops: string[][] ): string[][] {
  function startEnd ( l: string[] ) {return l.length === 0 ? '' : l[ 0 ] + "." + l[ l.length - 1 ]}

  return loops.reduce ( ( [ acc, startEnds ], loop ) => {
    let se = startEnd ( loop );
    if ( startEnds.includes ( se ) )
      return [ acc, startEnds ];
    else
      return [ [ ...acc, loop ], [ ...startEnds, se ] ]
  }, [ [], [] ] )[ 0 ]
}

export function uniqueLoops ( loop: RawLoops ) {
  if ( Object.keys ( loop ).length === 0 ) return []
  // console.log ( 'loop', loop )
  const cannonicalLoops: string[][] = flatMap ( Object.values ( loop ), list => safeArray ( list ).map ( cannonicalLoop ) );
  // console.log ( 'cannonicalLoops', [ ...cannonicalLoops ] )
  const sorted = unique ( cannonicalLoops, loop => loop.slice ( 0, loop.length - 2 ).join ( '.' ) ).sort ( ( a, b ) => a.length - b.length )
  // console.log ( 'sorted', sorted )
  const result = removeIfSuperLoop ( removeIfSamePath ( sorted ) );
  // console.log ( 'result', result )
  return result
}


export const findAllLoopsFor = ( cn: ChildNames ): RawLoops =>
  removeEmptyArrays ( mapObjectKeys ( cn, findLoopsFor ( cn, [] ) ) )


export const throwExceptionIfLoopsFor = ( prefix: string ) => ( cn: ChildNames ): ChildNames => {
  const loops = uniqueLoops ( findAllLoopsFor ( cn ) )
  if ( loops.length > 0 )
    throw Error ( `${prefix}\n${loops.map ( l => `  ${l.join ( ' -> ' )}` ).join ( '\n' )}` )
  return cn
};
