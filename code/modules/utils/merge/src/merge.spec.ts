import { mergeAll, mergeTwo, MergeOptions } from "./merge";

describe("mergeTwo", () => {
  describe("root-level missing handling", () => {
    it("returns right when left is undefined", () => {
      expect(mergeTwo(undefined, { a: 1 })).toEqual({ a: 1 });
    });

    it("returns left when right is undefined", () => {
      expect(mergeTwo({ a: 1 }, undefined)).toEqual({ a: 1 });
    });
  });

  describe("null handling", () => {
    it("treats null as missing by default at root level", () => {
      expect(mergeTwo(null, { a: 1 })).toEqual({ a: 1 });
      expect(mergeTwo({ a: 1 }, null)).toEqual({ a: 1 });
    });

    it("treats null as overwrite when configured at root level", () => {
      const options: MergeOptions = { nulls: "overwrite" };
      expect(mergeTwo({ a: 1 }, null, options)).toBeNull();
      expect(mergeTwo(null, { a: 1 }, options)).toEqual({ a: 1 });
    });

    it("does not overwrite with property null when nulls is missing", () => {
      expect(mergeTwo({ a: 1, b: 2 }, { a: null })).toEqual({ a: 1, b: 2 });
    });

    it("does overwrite with property null when nulls is overwrite", () => {
      expect(mergeTwo({ a: 1, b: 2 }, { a: null }, { nulls: "overwrite" })).toEqual({ a: null, b: 2 });
    });
  });

  describe("primitive and incompatible kinds", () => {
    it("uses right when both sides are primitives", () => {
      expect(mergeTwo(1, 2)).toBe(2);
      expect(mergeTwo("a", "b")).toBe("b");
      expect(mergeTwo(true, false)).toBe(false);
    });

    it("uses right when kinds are incompatible", () => {
      expect(mergeTwo({ a: 1 }, 3)).toBe(3);
      expect(mergeTwo(3, { a: 1 })).toEqual({ a: 1 });
      expect(mergeTwo({ a: 1 }, ["x"])).toEqual(["x"]);
      expect(mergeTwo(["x"], { a: 1 })).toEqual({ a: 1 });
    });
  });

  describe("array handling", () => {
    it("concatenates arrays by default at root level", () => {
      expect(mergeTwo([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
    });

    it("replaces arrays when concatenateArrays is false at root level", () => {
      expect(mergeTwo([1, 2], [3, 4], { concatenateArrays: false })).toEqual([3, 4]);
    });

    it("deduplicates concatenated arrays when deduplicateArrays is true", () => {
      expect(mergeTwo([1, 2, 3], [2, 3, 4], { deduplicateArrays: true })).toEqual([1, 2, 3, 4]);
    });

    it("preserves first-seen order when deduplicating arrays", () => {
      expect(mergeTwo(["a", "b"], ["b", "c", "a"], { deduplicateArrays: true })).toEqual(["a", "b", "c"]);
    });

    it("deduplicates by reference for objects in arrays", () => {
      const shared = { a: 1 };
      const sameShape = { a: 1 };

      expect(
          mergeTwo([shared, sameShape], [shared], { deduplicateArrays: true })
      ).toEqual([shared, sameShape]);
    });

    it("uses right when one side is array and the other is not", () => {
      expect(mergeTwo([1, 2], 3)).toBe(3);
      expect(mergeTwo({ a: 1 }, [2, 3])).toEqual([2, 3]);
    });

    it("concatenates property arrays by default", () => {
      expect(
          mergeTwo(
              { a: [1, 2], b: "x" },
              { a: [3, 4] }
          )
      ).toEqual({ a: [1, 2, 3, 4], b: "x" });
    });

    it("replaces property arrays when concatenateArrays is false", () => {
      expect(
          mergeTwo(
              { a: [1, 2], b: "x" },
              { a: [3, 4] },
              { concatenateArrays: false }
          )
      ).toEqual({ a: [3, 4], b: "x" });
    });

    it("deduplicates property arrays when configured", () => {
      expect(
          mergeTwo(
              { a: [1, 2, 3] },
              { a: [2, 4] },
              { deduplicateArrays: true }
          )
      ).toEqual({ a: [1, 2, 3, 4] });
    });
  });

  describe("object merging", () => {
    it("merges shallow objects", () => {
      expect(mergeTwo({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
    });

    it("uses right value for scalar conflicts", () => {
      expect(mergeTwo({ a: 1, b: 2 }, { a: 3 })).toEqual({ a: 3, b: 2 });
    });

    it("merges nested objects recursively", () => {
      expect(
          mergeTwo(
              { a: { x: 1, y: 2 }, b: 3 },
              { a: { y: 20, z: 30 } }
          )
      ).toEqual({ a: { x: 1, y: 20, z: 30 }, b: 3 });
    });

    it("uses right when nested kinds are incompatible", () => {
      expect(
          mergeTwo(
              { a: { x: 1 } },
              { a: 2 }
          )
      ).toEqual({ a: 2 });
    });

    it("does not deep merge when left nested value is null and nulls is overwrite", () => {
      expect(
          mergeTwo(
              { a: null },
              { a: { x: 1 } },
              { nulls: "overwrite" }
          )
      ).toEqual({ a: { x: 1 } });
    });

    it("adds property when left property is undefined", () => {
      expect(
          mergeTwo(
              { a: undefined, b: 2 },
              { a: 1 }
          )
      ).toEqual({ a: 1, b: 2 });
    });

    it("does not overwrite with property undefined", () => {
      expect(
          mergeTwo(
              { a: 1, b: 2 },
              { a: undefined, c: 3 }
          )
      ).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe("forbidden keys", () => {
    it("ignores forbidden keys from the left side", () => {
      const left = JSON.parse('{"safe":1,"__proto__":{"polluted":true},"constructor":{"x":1},"prototype":{"y":2}}');
      const result = mergeTwo(left, { other: 2 });

      expect(result).toEqual({ safe: 1, other: 2 });
      expect(({} as any).polluted).toBeUndefined();
    });

    it("ignores forbidden keys from the right side", () => {
      const right = JSON.parse('{"safe":2,"__proto__":{"polluted":true},"constructor":{"x":1},"prototype":{"y":2}}');
      const result = mergeTwo({ safe: 1 }, right);

      expect(result).toEqual({ safe: 2 });
      expect(({} as any).polluted).toBeUndefined();
    });
  });
});

describe("mergeAll", () => {
  it("returns {} for an empty array", () => {
    expect(mergeAll([])).toEqual({});
  });

  it("merges many objects in order", () => {
    expect(
        mergeAll([
          { a: 1, nested: { x: 1 } },
          { b: 2, nested: { y: 2 } },
          { a: 3, nested: { x: 10 } }
        ])
    ).toEqual({
      a: 3,
      b: 2,
      nested: { x: 10, y: 2 }
    });
  });

  it("passes options through all merges", () => {
    expect(
        mergeAll(
            [
              { a: [1, 2] },
              { a: [2, 3] },
              { a: [3, 4] }
            ],
            { deduplicateArrays: true }
        )
    ).toEqual({
      a: [1, 2, 3, 4]
    });
  });

  it("replaces arrays across multiple merges when concatenateArrays is false", () => {
    expect(
        mergeAll(
            [
              { a: [1, 2] },
              { a: [3] },
              { a: [4, 5] }
            ],
            { concatenateArrays: false }
        )
    ).toEqual({
      a: [4, 5]
    });
  });

  it("respects null overwrite across multiple merges", () => {
    expect(
        mergeAll(
            [
              { a: 1, b: 2 },
              { a: null },
              { c: 3 }
            ],
            { nulls: "overwrite" }
        )
    ).toEqual({
      a: null,
      b: 2,
      c: 3
    });
  });
});