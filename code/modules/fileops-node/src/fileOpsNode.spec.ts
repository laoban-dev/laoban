//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { fileOpsNode } from "./fileOpsNode";
import { FileOps } from "@laoban/fileops";


describe ( "fileOpsNode.loadFile", () => {
  it ( 'should load a file', async () => {
    expect ( await fileOpsNode ().loadFileOrUrl ( 'test.txt' ) ).toEqual ( 'some text' )
  } )
} )
describe ( "fileOpsNode.log", () => {
  const filename = 'log.test.txt';
  it ( 'should create a file with no speed up', async () => {
    const fileOps = fileOpsNode ( false );
    await fileOps.removeFile ( filename )
    await fileOps.log ( filename, 'some more text' )
    expect ( await fileOps.loadFileOrUrl ( filename ) ).toEqual ( 'some more text\n' )
  } )
  it ( 'should create  a file with  speed up', async () => {
    const fileOps = fileOpsNode ( true );
    await fileOps.removeFile ( filename )
    await fileOps.log ( filename, 'some more text' )
    expect ( await fileOps.loadFileOrUrl ( filename ) ).toEqual ( 'some more text\n' )
  } )
  it ( 'should append to a file with no speed up', async () => {
    const fileOps = fileOpsNode ( false );
    await fileOps.saveFile ( filename, 'initial text\n' )
    await fileOps.log ( filename, 'some more text' )
    expect ( await fileOps.loadFileOrUrl ( filename ) ).toEqual ( 'initial text\nsome more text\n' )
  } )
  it ( 'should append to a file with  speed up', async () => {
    const fileOps = fileOpsNode ( true );
    await fileOps.saveFile ( filename, 'initial text\n' )
    await fileOps.log ( filename, 'some more text' )
    expect ( await fileOps.loadFileOrUrl ( filename ) ).toEqual ( 'initial text\nsome more text\n' )
  } )
} )