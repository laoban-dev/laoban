import {freezeArray, freezeObject, safeArray, safeJson, safeObject, safePathSegment} from './safe'

describe('safeArray', () => {
    it('returns [] for undefined', () => {
        expect(safeArray(undefined)).toEqual([])
    })

    it('returns [] for null', () => {
        expect(safeArray(null)).toEqual([])
    })

    it('wraps a single value in an array', () => {
        expect(safeArray(3)).toEqual([3])
    })

    it('returns the original array unchanged', () => {
        const input = [1, 2, 3]
        const result = safeArray(input)
        expect(result).toBe(input)
    })

    it('returns a mutable empty array for nullish input', () => {
        const result = safeArray<number>(undefined)
        result.push(1)
        expect(result).toEqual([1])
    })
})

describe('freezeArray', () => {
    it('returns [] for undefined', () => {
        expect(freezeArray(undefined)).toEqual([])
    })

    it('returns [] for null', () => {
        expect(freezeArray(null)).toEqual([])
    })

    it('wraps a single value in a frozen array', () => {
        const result = freezeArray(3)
        expect(result).toEqual([3])
        expect(Object.isFrozen(result)).toBe(true)
    })

    it('returns a frozen copy of an array', () => {
        const input = [1, 2, 3]
        const result = freezeArray(input)
        expect(result).toEqual([1, 2, 3])
        expect(result).not.toBe(input)
        expect(Object.isFrozen(result)).toBe(true)
    })

    it('does not freeze the original array', () => {
        const input = [1, 2, 3]
        freezeArray(input)
        expect(Object.isFrozen(input)).toBe(false)
    })
})

describe('safeObject', () => {
    it('returns {} for undefined', () => {
        expect(safeObject(undefined)).toEqual({})
    })

    it('returns {} for null', () => {
        expect(safeObject(null)).toEqual({})
    })

    it('returns the original object unchanged', () => {
        const input = { a: 1 }
        const result = safeObject(input)
        expect(result).toBe(input)
    })

    it('returns a mutable empty object for nullish input', () => {
        const result = safeObject<number>(undefined)
        result.a = 1
        expect(result).toEqual({ a: 1 })
    })
})

describe('freezeObject', () => {
    it('returns {} for undefined', () => {
        expect(freezeObject(undefined)).toEqual({})
    })

    it('returns {} for null', () => {
        expect(freezeObject(null)).toEqual({})
    })

    it('returns a frozen copy of an object', () => {
        const input = { a: 1 }
        const result = freezeObject(input)
        expect(result).toEqual({ a: 1 })
        expect(result).not.toBe(input)
        expect(Object.isFrozen(result)).toBe(true)
    })

    it('does not freeze the original object', () => {
        const input = { a: 1 }
        freezeObject(input)
        expect(Object.isFrozen(input)).toBe(false)
    })
})

describe('safeJson', () => {
    it('stringifies plain data', () => {
        expect(safeJson({ a: 1 })).toBe('{"a":1}')
    })

    it('stringifies undefined the same way JSON.stringify does', () => {
        expect(safeJson(undefined)).toBe(undefined)
    })

    it('returns <unstringifiable> for circular data', () => {
        const x: any = {}
        x.self = x
        expect(safeJson(x)).toBe('<unstringifiable>')
    })
})


describe("safePathSegment", () => {
    it("leaves ordinary path-safe text unchanged", () => {
        expect(safePathSegment("alpha")).toBe("alpha")
        expect(safePathSegment("alpha-beta_123.log")).toBe("alpha-beta_123.log")
    })

    it("replaces Windows-invalid file characters with hyphens", () => {
        expect(safePathSegment(`a<b>c:d"e/f\\g|h?i*j`)).toBe("a-b-c-d-e-f-g-h-i-j")
    })

    it("replaces ISO timestamp colons so it can be used as a Windows path segment", () => {
        expect(safePathSegment("2026-04-27T10:52:13.507Z")).toBe(
            "2026-04-27T10-52-13.507Z"
        )
    })

    it("replaces slashes so values cannot create nested directories", () => {
        expect(safePathSegment("2026-04-27T10-52-13.507Z/config")).toBe(
            "2026-04-27T10-52-13.507Z-config"
        )
    })

    it("replaces ASCII control characters", () => {
        expect(safePathSegment("alpha\nbeta\tgamma\rdelta")).toBe(
            "alpha-beta-gamma-delta"
        )
    })

    it("returns an empty string for an empty string", () => {
        expect(safePathSegment("")).toBe("")
    })
})