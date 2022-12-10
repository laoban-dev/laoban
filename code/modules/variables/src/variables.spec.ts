import { derefence } from "./variables";

describe ( "derefence", () => {
  it ( "If the string has ${a} in it, then that is replaced by the dic entry, useUndefinedIfNotPresent false", () => {
    const dic = { a: "A", b: { c: "BC" } }
    expect ( derefence ( dic, "a", false ) ).toEqual ( 'a' )
    expect ( derefence ( dic, "b.c", false ) ).toEqual ( 'b.c' )
    expect ( derefence ( dic, "Some data ${a} here", false ) ).toEqual ( 'Some data A here' )
    expect ( derefence ( dic, "Some data ${b.c} here", false ) ).toEqual ( 'Some data BC here' )
    expect ( derefence ( dic, "Some data ${d} here", false ) ).toEqual ( 'Some data ${d} here' )
  } )
  it ( "If the string has ${a} in it, then that is replaced by the dic entry, useUndefinedIfNotPresent true", () => {
    const dic = { a: "A", b: { c: "BC" } }
    expect ( derefence ( dic, "Some data ${d} here", true ) ).toEqual ( 'Some data undefined here' )

  } )
} )