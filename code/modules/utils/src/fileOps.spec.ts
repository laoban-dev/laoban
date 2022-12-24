import { cachedLoad, emptyFileOps, meteredFileOps, MeteredFileOps } from "./fileOps";

const foundFileOps = (): MeteredFileOps => meteredFileOps ( {
  ...emptyFileOps,
  digest: s => 'digested(' + s + ')',
  loadFileOrUrl: s => Promise.resolve ( `loaded_${s}` )
} )
const notInCacheFileOps = (): MeteredFileOps => meteredFileOps ( {
  ...emptyFileOps,
  digest: s => 'digested(' + s + ')',
  loadFileOrUrl: s => s.includes ( 'digest' ) ? Promise.reject ( 'not in' ) : Promise.resolve ( `loaded_${s}` )
} )


describe ( "fileOps", () => {
  describe ( "cached load", () => {

    it ( "should use the fileOps for a filename", async () => {
      let fileOps = foundFileOps ();
      expect ( await cachedLoad ( fileOps, 'cache' ) ( 'filename' ) ).toEqual ( 'loaded_filename' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( await cachedLoad ( fileOps, undefined ) ( 'filename' ) ).toEqual ( 'loaded_filename' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 2 )

      expect ( fileOps.digestCount () ).toEqual ( 0 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
    } )

    it ( "should use the file ops when cache undefined", async () => {
      let fileOps = foundFileOps ();
      expect ( await cachedLoad ( fileOps, undefined ) ( 'https://someUrl' ) ).toEqual ( 'loaded_https://someUrl' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( fileOps.digestCount () ).toEqual ( 0 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
      expect ( fileOps.createDirCount () ).toEqual ( 0 )
    } )
    it ( "should use the cached value if it exists for urls when cache defined", async () => {
      let fileOps = foundFileOps ();
      expect ( await cachedLoad ( fileOps, 'cache' ) ( 'https://someUrl' ) ).toEqual ( 'loaded_cache/digested(https://someUrl)' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
      expect ( fileOps.createDirCount () ).toEqual ( 0 )
    } )
    it ( "should use the fileops value if cached value doesn't exist  when cache defined", async () => {
      let fileOps = foundFileOps ();
      expect ( await cachedLoad ( fileOps, 'cache' ) ( 'https://someUrl' ) ).toEqual ( 'loaded_cache/digested(https://someUrl)' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
      expect ( fileOps.createDirCount () ).toEqual ( 0 )
    } )
    it ( "should use the fileops if the item isn't in the cache, and then it should save the item in the cache", async () => {
      let fileOps = notInCacheFileOps ();
      expect ( await cachedLoad ( fileOps, 'cache' ) ( 'https://someUrl' ) ).toEqual ( 'loaded_https://someUrl' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 2 )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
      expect ( fileOps.saveFileCount () ).toEqual ( 1 )
      expect ( fileOps.lastSavedFileName () ).toEqual ( 'cache/digested(https://someUrl)' )
      expect ( fileOps.lastSavedFile () ).toEqual ( 'loaded_https://someUrl' )
      expect ( fileOps.createDirCount () ).toEqual ( 1 )
      expect ( fileOps.lastCreatedDir () ).toEqual ( 'cache' )
    } )
  } )
} )

describe ("copyFile", () =>{
  it("", ()=>{

  })
})