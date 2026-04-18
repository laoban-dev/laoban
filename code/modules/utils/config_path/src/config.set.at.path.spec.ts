
import { configPathToValue } from "./config.path.to.value";
import {configPathSetValue} from "./config.set.at.path";

describe("configPathSetValue", () => {
    test("sets a nested value immutably (creates new objects along the path)", () => {
        const original = { a: { b: { c: 1 }, keep: true }, stay: 99 };

        const updated = configPathSetValue(original, "a.b.c" as any, 42 as any);

        // value updated
        expect(configPathToValue(updated, "a.b.c" as any)).toBe(42);

        // original unchanged
        expect(configPathToValue(original, "a.b.c" as any)).toBe(1);

        // structural sharing: untouched branches should be referentially equal
        expect(updated.stay).toBe(99);
        expect(updated.a.keep).toBe(true);

        // but path segments are new objects
        expect(updated).not.toBe(original);
        expect(updated.a).not.toBe(original.a);
        expect(updated.a.b).not.toBe(original.a.b);

        // unrelated nested object under a (keep) remains same primitive value
        // (we don't check ref equality here because it's a primitive)
    });

    test("creates intermediate objects when they do not exist", () => {
        const original: any = { a: {} };

        const updated = configPathSetValue(original, "a.b.c" as any, "X" as any);

        expect(updated).toEqual({ a: { b: { c: "X" } } });
        expect(configPathToValue(updated, "a.b.c" as any)).toBe("X");
    });

    test("replaces non-object intermediates with objects to satisfy the path", () => {
        const original: any = { a: 123 };

        const updated = configPathSetValue(original, "a.b.c" as any, "Y" as any);

        expect(updated).toEqual({ a: { b: { c: "Y" } } });
    });

    test("overwrites an existing leaf value", () => {
        const original: any = { a: { b: { c: 1 } } };

        const updated = configPathSetValue(original, "a.b.c" as any, 2 as any);

        expect(updated).toEqual({ a: { b: { c: 2 } } });
    });

    test("can set an entire object at a non-leaf path", () => {
        const original: any = { a: { b: { c: 1 }, x: true } };

        const updated = configPathSetValue(original, "a.b" as any, { c: 9, d: 10 } as any);

        expect(updated).toEqual({ a: { b: { c: 9, d: 10 }, x: true } });
    });

    test("throws if the path would traverse into an array (array encountered before final segment)", () => {
        const original: any = { a: { b: [1, 2, 3] } };

        // trying to set inside array -> should throw
        expect(() => configPathSetValue(original, "a.b.c" as any, 1 as any)).toThrow(/array/i);
        expect(() => configPathSetValue(original, "a.b.0" as any, 1 as any)).toThrow(/array/i);

        // but setting the array itself (leaf) should be allowed
        const updated = configPathSetValue(original, "a.b" as any, ["x"] as any);
        expect(updated).toEqual({ a: { b: ["x"] } });
    });

    test("works when the root is not an object (creates a new object root)", () => {
        const original: any = null;

        const updated = configPathSetValue(original, "a.b" as any, 123 as any);

        expect(updated).toEqual({ a: { b: 123 } });
    });
});
