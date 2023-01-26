import { composePostProcessFn, postProcessCheckEnv, PostProcessFn, postProcessJson, postProcessJsonMergeInto } from "./postProcessFn";
import { CopyFileOptions, emptyFileOps, FileOps, TransformTextFn } from "./fileOps";
import { mapObjectValues } from "@laoban/utils";

const context = 'someContext'
const fileOps: FileOps = {
  ...emptyFileOps,
  loadFileOrUrl: async ( f ) => {
    if ( f === 'a.json' ) return JSON.stringify ( { a: "tochange" } )
    if ( f === 'b.json' ) return JSON.stringify ( { b: 2 } )
    if ( f === 'aWithPath.json' ) return JSON.stringify ( { a: { aValue: "tochange" } } )
    return 'file at ' + f
  }
}

const tx: TransformTextFn = async ( type, text ) => {
  return text.replace ( /tochange/g, `txedby${type}` )
}
const options: CopyFileOptions = { tx }
let cfd = { file: "somefileName" };
describe ( 'postProcessFn', () => {
  describe ( 'postProcessJson', () => {
    it ( 'should turn to json, and back to a string (no transformation) ', async () => {
      expect ( await postProcessJson ( context, fileOps, options, cfd ) ( '{"a":1, "a": 2}', 'json' ) ).toEqual (
        `{
  "a": 2
}` )
    } )
    it ( `should return undefined is the fileCmd isn't json`, async () => {
      expect ( await postProcessJson ( context, fileOps, options, cfd ) ( '{"a":1, "a": 2}', 'somethingelse' ) ).toEqual ( undefined )
    } )
    it ( `should throw an exception if the file isn't json`, () => {
      expect ( () => postProcessJson ( context, fileOps, options, cfd ) ( 'notjson', 'json' ) ).rejects.toThrow ( 'Invalid JSON for someContext: notjson' )
    } )
  } )

  describe ( 'postProcessCheckEnv', () => {
    const original = console.error
    var error: any = undefined

    beforeEach ( () => {
      process.env[ 'isin' ] = 'somevalue'
      delete process.env[ 'isnotin' ]
      error = jest.fn ()
      return console.error = error;
    } )

    afterEach ( () => console.error = original )

    it ( 'should return the input if the env variable is set', async () => {
      await expect ( postProcessCheckEnv ( context, fileOps, options, cfd ) ( 'someText', 'checkEnv(inin)' ) ).resolves.toEqual ( 'someText' )
    } )
    it ( 'should write to error, but still return the input if the env variable is not set', async () => {
      await expect ( postProcessCheckEnv ( context, fileOps, options, cfd ) ( 'someText', 'checkEnv(isnotin)' ) ).resolves.toEqual ( 'someText' )
      expect ( error ).toHaveBeenCalledWith ( `someContext
  requires the env variable [isnotin] to exist and it doesn't. This might cause problems` )
    } )

    it ( 'should return undefined if the fileCmd is not checkEnv', async () => {
      await expect ( postProcessCheckEnv ( context, fileOps, options, cfd ) ( 'someText', 'checkEnv' ) ).resolves.toEqual ( undefined )
      await expect ( postProcessCheckEnv ( context, fileOps, options, cfd ) ( 'someText', 'checkEnv(' ) ).resolves.toEqual ( undefined )
      await expect ( postProcessCheckEnv ( context, fileOps, options, cfd ) ( 'someText', 'checkEnv)' ) ).resolves.toEqual ( undefined )
      await expect ( postProcessCheckEnv ( context, fileOps, options, cfd ) ( 'someText', 'checkEnvWith(as)' ) ).resolves.toEqual ( undefined )
    } )
  } )

  describe ( 'postProcessJsonMergeInto', () => {
    const ppFn = postProcessJsonMergeInto ( context, fileOps, options, cfd )
    it ( 'should not crash with zero merges', async () => {
      await expect ( await ppFn ( '{"this": 1}', 'jsonMergeInto()' ) ).toEqual ( JSON.stringify ( { "this": 1 }, null, 2 ) )
    } )
    it ( "should merge a single file", async () => {
      await expect ( await ppFn ( '{"this": 1}', 'jsonMergeInto(a.json)' ) ).toEqual ( JSON.stringify ( {
        "a": "txedby${}",
        "this": 1
      }, null, 2 ) )
    } )
    it ( "overwrite the values in the jsonMergeInto with the values in the file", async () => {
      await expect ( await ppFn ( '{"this": 1, "a": "ignoreoriginal"}', 'jsonMergeInto(a.json)' ) ).toEqual ( JSON.stringify ( {
        "a": "ignoreoriginal",
        "this": 1
      }, null, 2 ) )
    } )
    it ( "should merge mutiplefiles", async () => {
      await expect ( await ppFn ( '{"this": 1}', 'jsonMergeInto(a.json,b.json)' ) ).toEqual ( JSON.stringify ( {
        "a": "txedby${}",
        "b": 2,
        "this": 1
      }, null, 2 ) )
    } )
    it ( "should merge a file with a path", async () => {
      await expect ( await ppFn ( '{"this": 1}', 'jsonMergeInto(aWithPath.json#a)' ) ).toEqual ( JSON.stringify ( {
        "aValue": "txedby${}",
        "this": 1
      }, null, 2 ) )
    } )
  } )
} )

const fn1: PostProcessFn = ( context, fileOps, options, cfd ) =>
  async ( text, fileCmd ) => {return fileCmd === "one" ? "fn1_" + text : undefined }
const fn1a: PostProcessFn = ( context, fileOps, options, cfd ) =>
  async ( text, fileCmd ) => {
    if ( fileCmd === "one" ) throw Error ( 'should not be called' );
    return undefined
  }
const fn2: PostProcessFn = ( context, fileOps, options, cfd ) =>
  async ( text, fileCmd ) => {return fileCmd === "two" ? "fn2_" + text : undefined }

const composed = composePostProcessFn ( fn1, fn1a, fn2 )

describe ( "composePostProcessFn", () => {
  it ( "should compose the passed in PostProcessFns", async () => {
    await expect ( composed ( context, fileOps, options, cfd ) ( "someText", "notin" ) ).resolves.toEqual ( undefined )
    await expect ( composed ( context, fileOps, options, cfd ) ( "someText", "one" ) ).resolves.toEqual ( 'fn1_someText' )
    await expect ( composed ( context, fileOps, options, cfd ) ( "someText", "two" ) ).resolves.toEqual ( 'fn2_someText' )
  } )
} )