import { compareVersionNumbers, findHighestVersion, nextMajorVersion, nextVersion } from "./versions";

describe ( "compareVersionNumbers", () => {
  it ( "should return 0 for equal versions - defined as the numbers the same", () => {
    expect ( compareVersionNumbers ( [ 1, 2, 3 ], [ 1, 2, 3 ] ) ).toBe ( 0 );
  } )
  it ( "should return 1 if first greater", () => {
    expect ( compareVersionNumbers ( [ 1, 2, 4 ], [ 1, 2, 3 ] ) ).toBe ( 1 );
    expect ( compareVersionNumbers ( [ 1, 3, 3 ], [ 1, 2, 100 ] ) ).toBe ( 1 );
    expect ( compareVersionNumbers ( [ 2, 2, 3 ], [ 1, 100, 3 ] ) ).toBe ( 1 );
  } )
  it ( "should return -1 if first lower", () => {
    expect ( compareVersionNumbers ( [ 1, 2, 2 ], [ 1, 2, 3 ] ) ).toBe ( -1 );
    expect ( compareVersionNumbers ( [ 1, 1, 0 ], [ 1, 2, 3 ] ) ).toBe ( -1 );
    expect ( compareVersionNumbers ( [ 0, 0, 0 ], [ 1, 2, 3 ] ) ).toBe ( -1 );
  } )
} )

describe( "findHighestVersion", () => {
  it ("should return the highest number ignoring non-numeric characters", () => {
    expect(findHighestVersion(["1.2.3", "1.2.4", "1.2.5"])).toBe("1.2.5")
    expect(findHighestVersion(["1.2.3", "2.2.4", "1.2.5"])).toBe("2.2.4")
    expect(findHighestVersion(["1.2.3-SNAPSHOT", "3.1-RC.4", "1-JUNK.2.5"])).toBe("3.1-RC.4")
  })
})



describe("nextMajorVersion", () => {
  it ("should return the next majorversion number", () => {
    expect(nextMajorVersion("1.2.3")).toBe("1.3.0")
    expect(nextMajorVersion("1.2.3RC1")).toBe("1.3.0")
    expect(nextMajorVersion("1.2")).toBe("1.3.0")
  })

})