//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { allButLastSegment, firstSegment, lastSegment } from "./strings";

describe ( "lastSegment", () => {
  it ( "should return the last segment of a string defined by the marker", () => {
    expect ( lastSegment ( 'one\\two' ) ).toEqual ( 'two' )
    expect ( lastSegment ( 'one/two' ) ).toEqual ( 'two' )
    expect ( lastSegment ( 'one/two', '/' ) ).toEqual ( 'two' )
    expect ( lastSegment ( 'one/two', '.' ) ).toEqual ( 'one/two' )
    expect ( lastSegment ( undefined, '.' ) ).toEqual ( undefined )
  } )
} )
describe ( "allButLastSegment", () => {
  it ( "should return all but the last segment of a string defined by the marker", () => {
    expect ( allButLastSegment ( 'one\\two' ) ).toEqual ( 'one' )
    expect ( allButLastSegment ( 'one/two' ) ).toEqual ( 'one' )
    expect ( allButLastSegment ( 'one/two/three' ) ).toEqual ( 'one/two' )
    expect ( allButLastSegment ( 'one/two/three', '/' ) ).toEqual ( 'one/two' )
    expect ( allButLastSegment ( 'one/two/three', '\\' ) ).toEqual ( '' )
  } )
} )

describe ( "firstSegment", () => {
  it ( "should return the first segment of a string defined by the marker", () => {
    expect ( firstSegment ( 'one/two', '/' ) ).toEqual ( 'one' )
    expect ( firstSegment ( 'one/two', '.' ) ).toEqual ( 'one/two' )
    expect ( firstSegment ( undefined, '.' ) ).toEqual ( undefined )
  } )
} )