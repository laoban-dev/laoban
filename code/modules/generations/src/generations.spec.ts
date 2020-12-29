import {calcGenerationsPromise, GenerationFns, GenerationView, generationView, mutateAndGetAllGens, mutateAndGetGen0} from "./generations";

interface Thing {
    name: string,
    children: Thing[]
}

let genFns: GenerationFns<Thing> = {
    name: t => t.name,
    children: t => t.children.map(x => x.name),
    errorMessage: (view: GenerationView) => Error(`had error in ${JSON.stringify(view)}`)
}
// let thing0a = {name: "zero", children: []}
let thing0a = {name: "zeroa", children: []}
let thing0b = {name: "zerob", children: []}

let thing1a = {name: "onea", children: [thing0a]}
let thing1b = {name: "oneb", children: [thing0a]}
let thing1c = {name: "onec", children: [thing0b]}

let thing2a = {name: "twoa", children: [thing0a, thing1a]}
let thing2b = {name: "twob", children: [thing1b]}
let thing2c = {name: "twoc", children: [thing0b, thing1a]}

let calc = calcGenerationsPromise(genFns)
describe("generations", () => {
    describe("empty generations", () => {
        it("should return an empty set of generations, if no data passed in", async () => {
            return calc([]).then(result => expect(result).toEqual([]))
        })
    })
    describe("just one generation", () => {
        it("should return only generation 0 when there are no dependancies ", async () => {
            expect(await calc([thing0a])).toEqual([[thing0a]])
        })
        it("should return only generation 0 when the named dependencies are not in the input list", async () => {
            expect(await calc([thing1a])).toEqual([[thing1a]])
            expect(await calc([thing2a])).toEqual([[thing2a]])
            expect(await calc([thing2c])).toEqual([[thing2c]])
        })
    })
    describe("generations when all links present", () => {
        it("return a list of generations where each generation is only dependant on earlier", async () => {
            expect(await calc([thing0a, thing1a])).toEqual([[thing0a], [thing1a]])
            expect(await calc([thing1a, thing0a])).toEqual([[thing0a], [thing1a]])
            expect(await calc([thing2a, thing1a, thing0a])).toEqual([[thing0a], [thing1a], [thing2a]])
        })
    })
    describe("generations have a loop", () => {
        it("return an error if have a loop", async () => {
            expect(await calc([thing0a, thing1a])).toEqual([[thing0a], [thing1a]])
            expect(await calc([thing1a, thing0a])).toEqual([[thing0a], [thing1a]])
            expect(await calc([thing2a, thing1a, thing0a])).toEqual([[thing0a], [thing1a], [thing2a]])
        })
    })
})

describe("generationView", () => {
    it("should be a subset of parent->child, filtered by whether the parents/children are in the input", () => {
        let view = generationView(genFns)
        expect(view([])).toEqual({})
        expect(view([thing0a])).toEqual({zeroa: []})
        expect(view([thing1a])).toEqual({onea: []})
        expect(view([thing2a])).toEqual({twoa: []})
        expect(view([thing0a, thing2c])).toEqual({zeroa: [], twoc: []})
        expect(view([thing0a, thing1a, thing2c])).toEqual({
            "onea": ["zeroa"],
            "twoc": ["onea"],
            "zeroa": []
        })
    })
})

describe("mutateAndGetAllGens", () => {
    it("should return a list of all gens and mutate the gen view to be empty if everything OK", () => {
        let gen: GenerationView = {
            "two": ["one"],
            "one": ["zeroa", "zerob"],
            "zeroa": [],
            "zerob": []
        }
        expect(mutateAndGetAllGens(gen)).toEqual([["zeroa", "zerob"], ["one"], ["two"]]);
        expect(gen).toEqual({})
    })
    it("should return a list of the gens it can do, and leave the loops in the gen", () => {
        let gen: GenerationView = {
            "two": ["one", "loop"],
            "one": ["zeroa", "zerob"],
            "zeroa": [],
            "zerob": [],
            "loop": ["two"]
        }
        expect(mutateAndGetAllGens(gen)).toEqual([["zeroa", "zerob"], ["one"]]);
        expect(gen).toEqual({"loop": ["two"], "two": ["loop"]})
    })

})
describe("mutateAndGetGen0", () => {
    it("should return nothing for empty", () => {
        let gen = {}
        expect(mutateAndGetGen0(gen)).toEqual([])
        expect(gen).toEqual({})
    })

    it("should return the gen0 and mutate the gen", () => {
        let gen: GenerationView = {
            "two": ["one"],
            "one": ["zeroa", "zerob"],
            "zeroa": [],
            "zerob": []
        }
        let gen0 = mutateAndGetGen0(gen);
        expect(gen0).toEqual(["zeroa", "zerob"])
        expect(gen).toEqual({"two": ["one"], "one": []})

        let gen1 = mutateAndGetGen0(gen);
        expect(gen1).toEqual(["one"])
        expect(gen).toEqual({"two": []})

        let gen2 = mutateAndGetGen0(gen);
        expect(gen2).toEqual(["two"])
        expect(gen).toEqual({})

        let gen3 = mutateAndGetGen0(gen);
        expect(gen3).toEqual([])
        expect(gen).toEqual({})
    })
    it("should not crash with loops, leaving a none empty gen at end", () => {
        let gen: GenerationView = {
            "two": ["one", "loop"],
            "one": ["zeroa", "zerob"],
            "zeroa": [],
            "zerob": [],
            "loop": ["two"]
        }
        let gen0 = mutateAndGetGen0(gen);
        expect(gen0).toEqual(["zeroa", "zerob"])
        expect(gen).toEqual({
            "loop": ["two"],
            "one": [],
            "two": ["one", "loop"]
        })

        let gen1 = mutateAndGetGen0(gen);
        expect(gen1).toEqual(["one"])
        expect(gen).toEqual({"loop": ["two"], "two": ["loop"]})

        let gen2 = mutateAndGetGen0(gen);
        expect(gen2).toEqual([])
        expect(gen).toEqual({"loop": ["two"], "two": ["loop"]})

    })
})