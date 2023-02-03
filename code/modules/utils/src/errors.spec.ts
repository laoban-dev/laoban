import { errors, flatMapErrors, flattenErrors, hasErrors, mapErrors, mapErrorsK, value } from "./errors";


describe ( "error handling", () => {
  it ( "should have hasErrors", () => {
    expect ( hasErrors ( "someString" ) ).toBe ( false )
    expect ( hasErrors ( [] ) ).toBe ( true )
  } )

  it ( "should have errors", () => {
    expect ( errors ( "someString" ) ).toEqual ( [] )
    expect ( errors ( [] ) ).toEqual ( [] )
  } )
  it ( "should have values", () => {
    expect ( value ( "someString" ) ).toEqual ( "someString" )
    expect ( value ( [] ) ).toBeUndefined ()
  } )

  it ( "should have mapErrors which returns the errors or applies the function", () => {
    expect ( mapErrors ( "someString", s => s + "1" ) ).toEqual ( "someString1" )
    expect ( mapErrors ( [ "some", "error" ], s => s + "1" ) ).toEqual ( [ "some", "error" ] )
  } )
  it ( "should have mapErrorsK which returns the errors or applies the function", () => {
    expect ( mapErrorsK ( "someString", s => Promise.resolve ( s + "1" ) ) ).resolves.toEqual ( "someString1" )
    expect ( mapErrorsK ( [ "some", "error" ], s => Promise.resolve ( s + "1" ) ) ).resolves.toEqual ( [ "some", "error" ] )
  } )
  it ( "should have flattenErrors", () => {
    expect ( flattenErrors ( "someString" ) ).toEqual ( "someString" )
    expect ( flattenErrors ( [ "some", "error" ] ) ).toEqual ( [ "some", "error" ] )
    expect ( flattenErrors ( [ [ "some" ], "error" ] ) ).toEqual ( [ "some", "error" ] )
  } )
  it ( "should have flatMapErrors which returns the errors or applies the function", () => {
    expect ( flatMapErrors ( "someString", s => s + "1" ) ).toEqual ( "someString1" )
    expect ( flatMapErrors ( "someString", s => [ 'an', 'error' ] ) ).toEqual ( [ 'an', 'error' ] )

    expect ( flatMapErrors ( [ "some", "error" ], s => s + "1" ) ).toEqual ( [ "some", "error" ] )
    expect ( flatMapErrors ( [ "some", "error" ], s => [ 'an', 'error' ] ) ).toEqual ( [ 'some', 'error' ] )
  } )
} )