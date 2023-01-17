import { jsonDelta } from "./jsonDelta";

describe ( "jsonDelta ", () => {
  describe ( "jsonDelta onlyUpdate = true", () => {
    it ( "simple should return a delta, ignoring new", () => {
      const original = { a: 1, b: 2, c: 3 };
      const replacement = { a: 1, b: 2, c: 4, d: 4 };
      const delta = jsonDelta ( original, replacement, true );
      expect ( delta ).toEqual ( { c: 4 } );
    } );

    it ( "nested should return a delta", () => {
      const original = { dev: { a: 1, b: 2, c: 3 }, other: "junk" };
      const replacement = { dev: { a: 1, b: 2, c: 4, d: 4 }, other: "junk" }
      const delta = jsonDelta ( original, replacement, true );
      expect ( delta ).toEqual ( { "dev": { "c": 4 } } );
    } );
  } )
  describe ( "jsonDelta onlyUpdate = false", () => {
    it ( "simple should return a delta, using new", () => {
      const original = { a: 1, b: 2, c: 3 };
      const replacement = { a: 1, b: 2, c: 4, d: 4 };
      const delta = jsonDelta ( original, replacement, false );
      expect ( delta ).toEqual ( { c: 4, d: 4 } );
    } );

    it ( "nested should return a delta using new", () => {
      const original = { dev: { a: 1, b: 2, c: 3 }, other: "junk" };
      const replacement = { dev: { a: 1, b: 2, c: 4, d: 4 }, other: "junk" }
      const delta = jsonDelta ( original, replacement, false );
      expect ( delta ).toEqual ( { "dev": { "c": 4, d: 4 } } );
    } );
  } )
} )

