import {findMax} from "./arrays"

describe("findMax", () => {
    it("returns 0 for an empty array", () => {
        expect(findMax([], value => value)).toEqual(0)
    })

    it("returns the largest numeric value", () => {
        expect(findMax([1, 5, 3, 2], value => value)).toEqual(5)
    })

    it("uses the supplied projection", () => {
        expect(findMax(["a", "abcd", "xy"], value => value.length)).toEqual(4)
    })

    it("works with objects", () => {
        const rows = [
            {name: "alpha"},
            {name: "beta"},
            {name: "very-long-name"},
        ]

        expect(findMax(rows, row => row.name.length)).toEqual(14)
    })

    it("returns 0 when all projected values are negative", () => {
        expect(findMax([-5, -2, -10], value => value)).toEqual(0)
    })
})