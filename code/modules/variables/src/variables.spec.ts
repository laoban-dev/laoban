import { derefence } from "./variables";

describe ( "derefence", () => {
  describe ( "simple variables like ${a}", () => {
    it ( "If the string has ${a} in it, then that is replaced by the dic entry", () => {
      const dic = { a: "A", b: { c: "BC" } }
      expect ( derefence ( 'context', dic, "a" ) ).toEqual ( 'a' )
      expect ( derefence ( 'context', dic, "b.c" ) ).toEqual ( 'b.c' )
      expect ( derefence ( 'context', dic, "Some data ${a} here" ) ).toEqual ( 'Some data A here' )
      expect ( derefence ( 'context', dic, "Some data ${b.c} here" ) ).toEqual ( 'Some data BC here' )
      expect ( derefence ( 'context', dic, "Some data ${d} here" ) ).toEqual ( "Some data //LAOBAN-UPDATE-ERROR context no value found. ref was ${d}. Value was undefined here" )
    } )

  } )
  describe ( "simple variables with indent like ${a:indentx}", () => {
    it ( "If the string has ${a:indentx} in it, then that is replaced by the dic entry", () => {
      const dic = { a: "A", b: { c: "BC" } }
      expect ( derefence ( 'context', dic, "Some data ${a:indent1} here" ) ).toEqual ( 'Some data A here' )
      expect ( derefence ( 'context', dic, "Some data ${a:indent2} here" ) ).toEqual ( 'Some data A here' )
      expect ( derefence ( 'context', dic, "Some data ${a:indent3} here" ) ).toEqual ( 'Some data A here' )
    } )

  } )

  const dic = { a: { 'this': 1, 'item': 2 } }
  describe ( "variable:object like ${a:object}", () => {
    it ( 'should replace an object with the string w/o {}', () => {
      expect ( derefence ( 'context', dic, '{"one":1,\n${a:object},\n"two":2}' ) ).toEqual (
        `{"one":1,
"this": 1,
"item": 2,
"two":2}` )
    } )
    it ( 'should report an error if the reference isnt an object', () => {
      expect ( derefence ( 'context', dic, '{"one":1,\n${b:object},\n"two":2}' ) ).toEqual (
        '{"one":1,\n' +
        '//LAOBAN-UPDATE-ERROR context no value found. ref was ${b:object}. Value was undefined,\n' +
        '"two":2}')

    } )

  } )
  describe ( "variable:object:indentx like ${a:object:indentx}", () => {
    it ( 'should replace an object with the string w/o {}', () => {
      expect ( derefence ( 'context', dic, '{"one":1,\n${a:object:indent1}\n"two":2}' ) ).toEqual ( `{"one":1,
 "this": 1,
 "item": 2
"two":2}` )
      expect ( derefence ( 'context', dic, '{"one":1,\n${a:object:indent3}\n"two":2}' ) ).toEqual ( `{"one":1,
   "this": 1,
   "item": 2
"two":2}` )
    } )
  } )
  describe ( "variable:object:comma like ${a:object:comma}", () => {
    it ( 'should replace an object with the string w/o {}', () => {
      expect ( derefence ( 'context', dic, '{"one":1,${a:object:comma},"two":2}' ) ).toEqual ( `{"one":1,"this": 1,
"item": 2,"two":2}` )
    } )
  } )

  describe ( "variable:object:comma:indentx like ${a:object:comma:indentx}", () => {
    it ( 'should replace an object with the string w/o {}', () => {
      expect ( derefence ( 'context', dic, '{"one":1,${a:object:comma:indent3},"two":2}' ) ).toEqual ( `{"one":1,   "this": 1,
   "item": 2,"two":2}` )
    } )

  } )
} )
