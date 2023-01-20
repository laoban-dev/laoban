//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { addDebug, DebugPrinter } from "./debug";

let context = { "some": "stuff" }

function remember ( array: any[][] ): DebugPrinter { return x => array.push ( x )}
describe ( "Debugging", () => {
  describe ( "addDebug", () => {
    it ( "should not change original object, and should have copied the original adding a debug", () => {
      let contextWithDebug = addDebug ( "one", x => {} ) ( context )
      expect ( context ).toEqual ( { "some": "stuff" } )
      expect ( contextWithDebug.some ).toBe ( "stuff" )
      expect ( typeof contextWithDebug.debug ).toEqual ( 'function' )
    } )
  } )

  describe ( 'message', () => {
    it (
      'should print a message if the section is enabled', () => {
        let remembered: any[][] = [];
        let one = addDebug ( "one", remember ( remembered ) ) ( context ).debug ( 'one' )
        one.message ( () => [ 'some', 'text' ] )
        one.message ( () => [ 'more', 'text' ] )
        expect ( remembered ).toEqual ( [ [ "some", "text" ], [ "more", "text" ] ] )
      } )
    it ( 'should not print a message if the section is not enabled', () => {
      let remembered: any[][] = [];
      let one = addDebug ( "two", remember ( remembered ) ) ( context ).debug ( 'one' )
      one.message ( () => [ 'some', 'text' ] )
      one.message ( () => [ 'more', 'text' ] )
      expect ( remembered ).toEqual ( [] )
    } )
  } )

  describe ( 'k', () => {
    let someError = new Error ( 'some error' );
    it ( 'should return the promise and print a message if the section is enabled', async () => {
      let remembered: any[][] = [];
      let one = addDebug ( "one", remember ( remembered ) ) ( context ).debug ( 'one' )
      let result = one.k ( () => 'some message', () => Promise.resolve ( 'some result' ) )
      return result.then ( res => {
        expect ( res ).toEqual ( 'some result' )
        expect ( remembered ).toEqual ( [ [ "one", "some message" ] ] )
      } )
    } )
    it ( 'should print an error message if the section is enabled', async () => {
      let remembered: any[][] = [];
      let one = addDebug ( "one", remember ( remembered ) ) ( context ).debug ( 'one' )
      let result = one.k ( () => 'some message', () => Promise.reject ( someError ) )
      return result.then ( r => fail ( r ), e => {
        expect ( e ).toEqual ( someError )
        expect ( remembered.length ).toEqual ( 1 )
        expect ( remembered[ 0 ] ).toEqual ( [ "one", "error executing ", "some message", someError ] )
      } )
    } )
    it ( 'should not print a message if the section is not enabled', async () => {
      let remembered: any[][] = [];
      let one = addDebug ( "two", remember ( remembered ) ) ( context ).debug ( 'one' )
      return one.k ( () => 'some message', () => Promise.resolve ( 'some result' ) ).//
        then ( res => {
          expect ( res ).toEqual ( 'some result' )
          expect ( remembered ).toEqual ( [] )
        } )
    } )
  } )
} )