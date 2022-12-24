import { cachedFileOps, cachedLoad, fileOpsStats, emptyFileOps, meteredFileOps, MeteredFileOps, copyFile, copyFiles, childDirs, lastSegment } from "./fileOps";

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
      expect ( fileOpsStats ( fileOps ) ).toEqual ( { "createDirCount": 0, "loadFileOrUrlCount": 1, "saveFileCount": 0 } )
      expect ( fileOps.digestCount () ).toEqual ( 0 )
    } )
    it ( "should use the cached value if it exists for urls when cache defined", async () => {
      const fileOps = foundFileOps ();
      const cached = cachedFileOps ( fileOps, 'cache' );
      expect ( await cached.loadFileOrUrl ( 'https://someUrl' ) ).toEqual ( 'loaded_cache/digested(https://someUrl)' )
      expect ( fileOpsStats ( fileOps ) ).toEqual ( { "createDirCount": 0, "loadFileOrUrlCount": 1, "saveFileCount": 0 } )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
    } )
    it ( "should use the fileops value if cached value doesn't exist  when cache defined", async () => {
      const fileOps = foundFileOps ();
      const cached = cachedFileOps ( fileOps, 'cache' );
      expect ( await cached.loadFileOrUrl ( 'https://someUrl' ) ).toEqual ( 'loaded_cache/digested(https://someUrl)' )
      expect ( fileOpsStats ( fileOps ) ).toEqual ( { "createDirCount": 0, "loadFileOrUrlCount": 1, "saveFileCount": 0 } )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
    } )
    it ( "should use the fileops if the item isn't in the cache, and then it should save the item in the cache", async () => {
      const fileOps = notInCacheFileOps ();
      const cached = cachedFileOps ( fileOps, 'cache' );
      expect ( await cached.loadFileOrUrl ( 'https://someUrl' ) ).toEqual ( 'loaded_https://someUrl' )
      expect ( fileOpsStats ( fileOps ) ).toEqual ( { "createDirCount": 1, "loadFileOrUrlCount": 2, "saveFileCount": 1 } )
      expect ( fileOps.digestCount () ).toEqual ( 1 )
      expect ( fileOps.lastSavedFileName () ).toEqual ( 'cache/digested(https://someUrl)' )
      expect ( fileOps.lastSavedFile () ).toEqual ( 'loaded_https://someUrl' )
      expect ( fileOps.savedFiles () ).toEqual ( [ [ "cache/digested(https://someUrl)", "loaded_https://someUrl" ] ] )
    } )
  } )
} )


describe ( "copyFile", () => {
  it ( "it should copy a file", async () => {
    const fileOps = foundFileOps ();
    await copyFile ( fileOps, 'rootUrl', 'target' ) ( 'url' )
    expect ( fileOps.savedFiles () ).toEqual ( [ [ "target/url", "loaded_rootUrl/url" ] ] )
  } )
} )
describe ( "copyFiles", () => {
  it ( "it should copy files", async () => {
    const fileOps = foundFileOps ();
    await copyFiles ( 'someContext', fileOps, 'rootUrl', 'target' ) ( [ 'url1', 'url2' ] )
    expect ( fileOps.savedFiles () ).toEqual ( [
      [ "target/url1", "loaded_rootUrl/url1" ],
      [ "target/url2", "loaded_rootUrl/url2" ]
    ] )
  } )
} )


describe ( "childDirs", () => {
  const fileOps = (): MeteredFileOps => meteredFileOps ( {
    ...emptyFileOps,
    listFiles: root => Promise.resolve ( root.length > 10 ? [] : [ 1, 2 ].map ( i => lastSegment ( root ) + i ) ),
    isDirectory ( filename: string ): Promise<boolean> {return Promise.resolve ( true )}
  } )
  it ( "it should find all the descendants if no filter", async () => {
    expect ( await childDirs ( fileOps (), s => false ) ( 'X' ) ).toEqual ( [
      "X/X1",
      "X/X2",
      "X/X1/X11",
      "X/X1/X12",
      "X/X1/X11/X111",
      "X/X1/X11/X112",
      "X/X1/X12/X121",
      "X/X1/X12/X122",
      "X/X2/X21",
      "X/X2/X22",
      "X/X2/X21/X211",
      "X/X2/X21/X212",
      "X/X2/X22/X221",
      "X/X2/X22/X222"
    ] )
  } )
  it ( "it should find all the descendants that aren't filtered out", async () => {
    expect ( await childDirs ( fileOps (), s => s.endsWith ( '12' ) ) ( 'X' ) ).toEqual ( [
      "X/X1",
      "X/X2",
      "X/X1/X11",
      "X/X1/X11/X111",
      "X/X2/X21",
      "X/X2/X22",
      "X/X2/X21/X211",
      "X/X2/X22/X221",
      "X/X2/X22/X222"
    ] )
  } )
} )