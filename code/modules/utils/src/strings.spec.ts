import { firstSegment, lastSegment } from "./strings";

describe ( "lastSegment", () => {
  it ( "should return the last segment of a string defined by the marker", () => {
    expect ( lastSegment ( 'one/two', '/' ) ).toEqual ( 'two' )
    expect ( lastSegment ( 'one/two', '.' ) ).toEqual ( 'one/two' )
    expect ( lastSegment ( undefined, '.' ) ).toEqual ( undefined )
  } )
} )

describe ( "firstSegment", () => {
  it ( "should return the first segment of a string defined by the marker", () => {
    expect ( firstSegment ( 'one/two', '/' ) ).toEqual ( 'one' )
    expect ( firstSegment ( 'one/two', '.' ) ).toEqual ( 'one/two' )
    expect ( firstSegment ( undefined, '.' ) ).toEqual ( undefined )
  } )
} )