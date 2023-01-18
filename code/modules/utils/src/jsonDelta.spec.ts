import { jsonDelta, JsonDeltaOptions } from "./jsonDelta";

describe ( "jsonDelta ", () => {
  describe ( "jsonDelta onlyUpdate = true", () => {
    const onlyUpdateTrue = {onlyUpdate: true}
    it ( "simple should return a delta, ignoring new", () => {
      const original = { a: 1, b: 2, c: 3 };
      const replacement = { a: 1, b: 2, c: 4, d: 4 };
      const delta = jsonDelta ( original, replacement, onlyUpdateTrue );
      expect ( delta ).toEqual ( { c: 4 } );
    } );

    it ( "nested should return a delta", () => {
      const original = { dev: { a: 1, b: 2, c: 3 }, other: "junk" };
      const replacement = { dev: { a: 1, b: 2, c: 4, d: 4 }, other: "junk" }
      const delta = jsonDelta ( original, replacement, onlyUpdateTrue );
      expect ( delta ).toEqual ( { "dev": { "c": 4 } } );
    } );
  } )
  describe ( "jsonDelta onlyUpdate = true, showDiff: true", () => {
    const options: JsonDeltaOptions = {onlyUpdate: true, showDiff: (o, n) => `${o} => ${n}`}
    it ( "simple should return a delta, ignoring new", () => {
      const original = { a: 1, b: 2, c: 3 };
      const replacement = { a: 1, b: 2, c: 4, d: 4 };
      const delta = jsonDelta ( original, replacement, options );
      expect ( delta ).toEqual ( { "c": "3 => 4"} );
    } );

    it ( "nested should return a delta", () => {
      const original = { dev: { a: 1, b: 2, c: 3 }, other: "junk" };
      const replacement = { dev: { a: 1, b: 2, c: 4, d: 4 }, other: "junk" }
      const delta = jsonDelta ( original, replacement, options );
      expect ( delta ).toEqual ( { "dev": { "c": "3 => 4"} } );
    } );
  } )
  describe ( "jsonDelta onlyUpdate = false", () => {
    const onlyUpdateFalse = {onlyUpdate: false}
    it ( "simple should return a delta, using new", () => {
      const original = { a: 1, b: 2, c: 3 };
      const replacement = { a: 1, b: 2, c: 4, d: 4 };
      const delta = jsonDelta ( original, replacement, onlyUpdateFalse );
      expect ( delta ).toEqual ( { c: 4, d: 4 } );
    } );

    it ( "nested should return a delta using new", () => {
      const original = { dev: { a: 1, b: 2, c: 3 }, other: "junk" };
      const replacement = { dev: { a: 1, b: 2, c: 4, d: 4 }, other: "junk" }
      const delta = jsonDelta ( original, replacement, onlyUpdateFalse );
      expect ( delta ).toEqual ( { "dev": { "c": 4, d: 4 } } );
    } );
  } )
} )

