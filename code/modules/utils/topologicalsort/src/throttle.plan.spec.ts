import { throttlePlan } from "./throttle.plan"

describe("throttlePlan", () => {
    it("leaves generations unchanged when they are already within the throttle", () => {
        const input = [
            ["a", "b"],
            ["c"],
            ["d", "e"],
        ]

        expect(throttlePlan(input, 2)).toEqual([
            ["a", "b"],
            ["c"],
            ["d", "e"],
        ])
    })

    it("splits generations larger than the throttle", () => {
        const input = [
            ["a", "b", "c", "d"],
            ["e", "f"],
            ["g", "h", "i"],
        ]

        expect(throttlePlan(input, 2)).toEqual([
            ["a", "b"],
            ["c", "d"],
            ["e", "f"],
            ["g", "h"],
            ["i"],
        ])
    })

    it("preserves the order of items within each generation", () => {
        const input = [
            [1, 2, 3, 4, 5],
        ]

        expect(throttlePlan(input, 2)).toEqual([
            [1, 2],
            [3, 4],
            [5],
        ])
    })

    it("preserves earlier generations before later generations", () => {
        const input = [
            ["g1-a", "g1-b", "g1-c"],
            ["g2-a", "g2-b", "g2-c"],
        ]

        expect(throttlePlan(input, 2)).toEqual([
            ["g1-a", "g1-b"],
            ["g1-c"],
            ["g2-a", "g2-b"],
            ["g2-c"],
        ])
    })

    it("turns throttle 1 into one item per generation", () => {
        const input = [
            ["a", "b"],
            ["c"],
        ]

        expect(throttlePlan(input, 1)).toEqual([
            ["a"],
            ["b"],
            ["c"],
        ])
    })

    it("returns an empty plan for empty input", () => {
        expect(throttlePlan([], 2)).toEqual([])
    })

    it("drops empty generations", () => {
        const input = [
            ["a"],
            [],
            ["b", "c"],
        ]

        expect(throttlePlan(input, 2)).toEqual([
            ["a"],
            ["b", "c"],
        ])
    })

    it("throws when throttle is zero", () => {
        expect(() => throttlePlan([["a"]], 0)).toThrow(
            "Throttle must be a positive integer. Received: 0",
        )
    })

    it("throws when throttle is negative", () => {
        expect(() => throttlePlan([["a"]], -1)).toThrow(
            "Throttle must be a positive integer. Received: -1",
        )
    })

    it("throws when throttle is not an integer", () => {
        expect(() => throttlePlan([["a"]], 1.5)).toThrow(
            "Throttle must be a positive integer. Received: 1.5",
        )
    })
})