import { fromEntries, deepCombineTwoObjects, mapObject, mapObjectKeys, removeEmptyArrays, safeArray, unique } from "./utils";

describe ( 'safeArray', () => {
  it ( "should return the array if defined", () => {
    expect ( safeArray ( [] ) ).toEqual ( [] )
    expect ( safeArray ( [ 1 ] ) ).toEqual ( [ 1 ] )
  } )
  it ( "should return an empty array if undefined", () => {
    expect ( safeArray ( undefined ) ).toEqual ( [] )
  } )
} )

describe ( 'removeEmptyArrays', () => {
  it ( "should return the object if everything is populated", () => {
    expect ( removeEmptyArrays ( {} ) ).toEqual ( {} )
    expect ( removeEmptyArrays ( { a: [ 1 ], b: [ 2 ] } ) ).toEqual ( { a: [ 1 ], b: [ 2 ] } )
  } )
  it ( 'should remove undefined', () => {
    expect ( removeEmptyArrays ( { a: undefined, b: [ 1 ] } ) ).toEqual ( { b: [ 1 ] } )

  } )
  it ( 'should remove empty arrays', () => {
    expect ( removeEmptyArrays ( { a: [], b: [ 1 ] } ) ).toEqual ( { b: [ 1 ] } )
  } )
} )

describe ( "mapObjectKeys", () => {
  it ( "should apply a function to the keys", () => {
    expect ( mapObjectKeys ( {}, x => x + 1 ) ).toEqual ( {} )
    expect ( mapObjectKeys ( { a: 1, b: 2 }, x => x + 1 ) ).toEqual ( { a: 'a1', b: 'b1' } )
  } )
  it ( "should remove any undefined results", () => {
    expect ( mapObjectKeys ( { a: 1, b: 2 }, x => x === 'a' ? undefined : x ) ).toEqual ( { b: 'b' } )
  } )
} )

describe ( "fromEntries", () => {
  it ( 'should create an object made of key values', () => {
    expect ( fromEntries () ).toEqual ( {} )
    expect ( fromEntries ( [ 'a', 1 ], [ 'b', 2 ] ) ).toEqual ( { a: 1, b: 2 } )
  } )
  it ( 'should ignore undefined values', () => {
    expect ( fromEntries ( [ 'a', 1 ], [ 'b', undefined ] ) ).toEqual ( { a: 1 } )
  } )
} )

describe ( 'mapObject', () => {
  it ( 'map over the key values', () => {
    expect ( mapObject<number, number> ( {}, x => x + 1 ) ).toEqual ( {} )
    expect ( mapObject ( { a: 1, b: 2 }, x => x + 1 ) ).toEqual ( { a: 2, b: 3 } )
  } )
  it ( 'ignore undefined', () => {
    expect ( mapObject ( { a: 1, b: 2 }, x => x === 1 ? undefined : x ) ).toEqual ( { b: 2 } )
  } )
} )

describe ( 'unique', () => {
  it ( 'should return a unique set of values based on the function', () => {
    expect ( unique ( [], x => x[ 0 ] ) ).toEqual ( [] )
    expect ( unique ( [ 'a', 'a', 'b', 'c' ], x => x ) ).toEqual ( [ 'a', 'b', 'c' ] )
    expect ( unique ( [ 'a1', 'a2', 'b', 'c' ], x => x[ 0 ] ) ).toEqual ( [ 'a1', 'b', 'c' ] )
  } )
} )

describe ( 'level1CombineTwoObjects', () => {
    it ( 'should combine two objects - shallow only', () => {
      expect ( deepCombineTwoObjects ( { a: 1 }, { b: 2, x: { q: 1 } } ) ).toEqual (
        { "a": 1, "b": 2, "x": { "q": 1 } } )
      expect ( deepCombineTwoObjects ( { a: 1, b: 2 }, { b: 3 } ) ).toEqual ( { a: 1, b: 3 } )
    } )
    it ( 'should combine two objects - deeper', () => {
      expect ( deepCombineTwoObjects ( { a: { b: 1, c: 2 } }, { p: 2, a: { b: 2, d: 3 } } ) ).toEqual ( {
        "a": { "b": 2, "c": 2, "d": 3 },
        "p": 2
      } )
    } )
  }
)