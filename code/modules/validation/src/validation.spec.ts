//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { Validate } from "./validation";

interface Test {
  a: string,
  b: number,
  c: Child,
  d: Child[]
}
interface Child {
  c1: string
}

describe ( "Validation", () => {

  it ( 'allows simple field validations when everything oK', () => {
    expect ( Validate.validate ( 'root', { a: 1, b: 2 } ).isNumber ( 'a' ).isNumber ( 'b' ).errors ).toEqual ( [] )
    expect ( Validate.validate ( 'root', { a: "one", b: "two" } ).isString ( 'a' ).isString ( 'b' ).errors ).toEqual ( [] )
  } )

  it ( 'allows simple field validations when errors', () => {
    expect ( Validate.validate ( 'root', { a: 1, b: 2 } ).isNumber ( 'a' ).isString ( 'b' ).errors ).toEqual ( [ 'root.b should be a string.' ] )
    expect ( Validate.validate ( 'root', { a: "one", b: "two" } ).isNumber ( 'a' ).isString ( 'b' ).errors ).toEqual ( [ 'root.a should be a number.' ] )
  } )

  it ( 'allows child objects to be validated - when child not present', () => {
    let ab: any = { a: "one", b: "two" };
    let t: Test = ab;
    expect ( Validate.validate ( 'root', t ).isObject ( 'c', vc => vc.isString ( 'c1' ) ).errors ).toEqual ( [ 'root.c should be an object.' ] )

  } )
  it ( 'allows child objects to be validated - when child present but wrong', () => {
    let ab: any = { a: "one", b: "two", c: { c1: 1 } };
    let t: Test = ab;
    expect ( Validate.validate ( 'root', t ).isObject ( 'c', vc => vc.isString ( 'c1' ) ).errors ).toEqual ( [ 'root.c.c1 should be a string.' ] )
  } )
  it ( 'allows child arrays of arrays to be validated, when not present', () => {
    let ab: any = { a: "one", b: "two" };
    let t: Test = ab;
    expect ( Validate.validate ( 'root', t ).isArrayofObjects<Child> ( 'd', ( vc ) =>
      vc.isString ( 'c1' ) ).errors ).toEqual ( [ 'root.d is not an array.' ] )
  } )
  it ( 'allows child arrays of arrays to be validated, when not array ', () => {
    let ab: any = { a: "one", b: "two", d: 1 };
    let t: Test = ab;
    expect ( Validate.validate ( 'root', t ).isArrayofObjects<Child> ( 'd', vc => vc.isString ( 'c1' ) ).errors ).toEqual ( [ 'root.d is not an array.' ] )
  } )
  it ( 'allows child arrays of objects to be validated ', () => {
    let ab: any = { a: "one", b: "two", d: [ { c1: 1 }, { c1: "s" }, {}, { c1: {} } ] };
    let t: Test = ab;
    expect ( Validate.validate ( 'root', t ).isArrayofObjects<Child> ( 'd', vc => vc.isString ( 'c1' ) ).errors ).toEqual ( [
      "root.d[0].c1 should be a string.",
      "root.d[2].c1 should be a string.",
      "root.d[3].c1 should be a string." ] )
  } )
  it ( ' allows objects of obejcts to be validated ', () => {
//TODO
  } )
  it ( 'allows NameAndString to be validated', () => {
    let fieldNotDefined = {}
    let fieldHasNameAndX = { field: { a: 1, b: "2", c: {} } }
    let fieldOK = { field: { a: "1", b: "2" } }
    expect ( Validate.validate ( 'root', fieldNotDefined ).isNameAnd ( 'field' ).errors )
      .toEqual ( [ "root field should be defined." ] )
    expect ( Validate.validate ( 'root', fieldHasNameAndX ).isNameAnd ( 'field' ).errors ).toEqual ( [
      "root field[a] should be a string. Its type is number",
      "root field[c] should be a string. Its type is object"
    ] )
    expect ( Validate.validate ( 'root', fieldOK ).isNameAnd ( 'field' ).errors ).toEqual ( [] )
  } )
  it ( 'allows NameAndString to be validated with reasons', () => {
    let fieldNotDefined = {}
    let fieldHasNameAndX = { field: { a: 1, b: "2", c: {} } }
    let fieldOK = { field: { a: "1", b: "2" } }
    expect ( Validate.validate ( 'root', fieldNotDefined ).isNameAnd ( 'field', 'someReason' ).errors )
      .toEqual ( [ "root field should be defined. someReason" ] )
    expect ( Validate.validate ( 'root', fieldHasNameAndX ).isNameAnd ( 'field', 'someReason' ).errors ).toEqual ([
      "root field[a] should be a string. Its type is number someReason",
      "root field[c] should be a string. Its type is object someReason"
    ])
    expect ( Validate.validate ( 'root', fieldOK ).isNameAnd ( 'field', 'someReason' ).errors ).toEqual ( [] )
  } )

} )