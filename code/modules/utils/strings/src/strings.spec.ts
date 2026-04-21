import {getLastSegment, normalisePath, toKebabCase} from "./strings";

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
describe('toKebabCase', () => {
    it('should convert camelCase to kebab-case', () => {
        expect(toKebabCase('dryRun')).toBe('dry-run');
    });

    it('should convert snake_case to kebab-case', () => {
        expect(toKebabCase('dry_run')).toBe('dry-run');
    });

    it('should lower-case plain PascalCase-ish words', () => {
        expect(toKebabCase('DryRun')).toBe('dry-run');
    });

    it('should leave kebab-case as kebab-case', () => {
        expect(toKebabCase('dry-run')).toBe('dry-run');
    });

    it('should return lower-case for already simple names', () => {
        expect(toKebabCase('force')).toBe('force');
    });

    it('should handle mixed underscores and camelCase', () => {
        expect(toKebabCase('dry_RunNow')).toBe('dry-run-now');
    });

    it('should return empty string unchanged', () => {
        expect(toKebabCase('')).toBe('');
    });

    it('should return null unchanged', () => {
        expect(toKebabCase(null)).toBeNull();
    });

    it('should return undefined unchanged', () => {
        expect(toKebabCase(undefined)).toBeUndefined();
    });

    it.each([
        ['dryRun', 'dry-run'],
        ['dry_run', 'dry-run'],
        ['DryRun', 'dry-run'],
        ['force', 'force'],
        ['already-kebab', 'already-kebab'],
        [null, null],
        [undefined, undefined],
    ])('should map %p to %p', (input, expected) => {
        expect(toKebabCase(input as any)).toBe(expected);
    });
});

describe("normalisePath", () => {
    it("returns undefined when given undefined", () => {
        expect(normalisePath(undefined)).toBeUndefined();
    });

    it("returns null when given null", () => {
        expect(normalisePath(null)).toBeNull();
    });

    it("returns empty string unchanged", () => {
        expect(normalisePath("")).toBe("");
    });

    it("returns a path with forward slashes unchanged", () => {
        expect(normalisePath("/a/b/c")).toBe("/a/b/c");
    });

    it("replaces backslashes with forward slashes", () => {
        expect(normalisePath("\\a\\b\\c")).toBe("/a/b/c");
    });

    it("replaces mixed slashes with forward slashes", () => {
        expect(normalisePath("a\\b/c\\d")).toBe("a/b/c/d");
    });

    it("normalises a windows path", () => {
        expect(normalisePath("C:\\temp\\folder\\file.txt")).toBe("C:/temp/folder/file.txt");
    });
});