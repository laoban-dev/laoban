import { cachedFileOps, cachedLoad, emptyFileOps, meteredFileOps, MeteredFileOps } from "./fileOps";

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
      const fileOps = foundFileOps ();
      const cached = cachedFileOps ( fileOps, 'cache' );
      expect ( await cached.loadFileOrUrl ( 'filename' ) ).toEqual ( 'loaded_filename' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( await cached.loadFileOrUrl ( 'filename' ) ).toEqual ( 'loaded_filename' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 2 )

      expect ( fileOps.digestCount () ).toEqual ( 0 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
    } )

    it ( "should use the file ops when cache undefined", async () => {
      const fileOps = foundFileOps ();
      const cached = cachedFileOps ( fileOps, undefined );
      expect ( await cached.loadFileOrUrl ( 'https://someUrl' ) ).toEqual ( 'loaded_https://someUrl' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( fileOps.digestCount () ).toEqual ( 0 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
      expect ( fileOps.createDirCount () ).toEqual ( 0 )
    } )
    it ( "should use the cached value if it exists for urls when cache defined", async () => {
      const fileOps = foundFileOps ();
      const cached = cachedFileOps ( fileOps, 'cache' );
      expect ( await cached.loadFileOrUrl ( 'https://someUrl' ) ).toEqual ( 'loaded_cache/digested(https://someUrl)' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
      expect ( fileOps.createDirCount () ).toEqual ( 0 )
    } )
    it ( "should use the fileops value if cached value doesn't exist  when cache defined", async () => {
      const fileOps = foundFileOps ();
      const cached = cachedFileOps ( fileOps, 'cache' );
      expect ( await cached.loadFileOrUrl ( 'https://someUrl' ) ).toEqual ( 'loaded_cache/digested(https://someUrl)' )
      expect ( fileOps.loadFileOrUrlCount () ).toEqual ( 1 )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
      expect ( fileOps.saveFileCount () ).toEqual ( 0 )
      expect ( fileOps.createDirCount () ).toEqual ( 0 )
    } )
    it ( "should use the fileops if the item isn't in the cache, and then it should save the item in the cache", async () => {
      const fileOps = notInCacheFileOps ();
      const cached = cachedFileOps ( fileOps, 'cache' );
      expect ( await cached.loadFileOrUrl ( 'https://someUrl' )  ).toEqual ( 'loaded_https://someUrl' )
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

