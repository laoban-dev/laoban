import { fileOps } from "./files";


describe ( "fileOps.loadFile", () => {
  it ( 'should load a file', async() => {
    expect (await fileOps.loadFileOrUrl ( 'test.txt' ) ).toEqual ('some text' )
  } )
} )