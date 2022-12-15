import { fileOps } from "./files";


describe ( "fileOps.loadFile", () => {
  it ( 'should load a file', async() => {
    expect (await fileOps.loadFile ( 'test.txt' ) ).toEqual ('some text' )
  } )
} )