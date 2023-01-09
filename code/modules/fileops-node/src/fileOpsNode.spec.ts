import { fileOpsNode } from "./fileOpsNode";


describe ( "fileOpsNode.loadFile", () => {
  it ( 'should load a file', async() => {
    expect (await fileOpsNode.loadFileOrUrl ( 'test.txt' ) ).toEqual ('some text' )
  } )
} )