import { getLastSegment } from "./strings";

describe("getLastSegment", () => {
    it("returns empty string for undefined", () => {
        expect(getLastSegment(undefined)).toBe("");
    });

    it("returns empty string for null", () => {
        expect(getLastSegment(null)).toBe("");
    });

    it("returns empty string for empty input", () => {
        expect(getLastSegment("")).toBe("");
    });

    it("returns empty string for root slash", () => {
        expect(getLastSegment("/")).toBe("");
    });

    it("returns the segment for a single segment path", () => {
        expect(getLastSegment("abc")).toBe("abc");
    });

    it("returns the last segment for a normal path", () => {
        expect(getLastSegment("a/b/c")).toBe("c");
    });

    it("ignores leading slashes", () => {
        expect(getLastSegment("/a/b/c")).toBe("c");
    });

    it("ignores trailing slashes", () => {
        expect(getLastSegment("a/b/c/")).toBe("c");
    });

    it("ignores repeated slashes", () => {
        expect(getLastSegment("a//b///c")).toBe("c");
    });

    it("returns empty string for only slashes", () => {
        expect(getLastSegment("///")).toBe("");
    });
});