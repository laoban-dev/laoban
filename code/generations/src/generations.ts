export interface GenerationFns<G> {
    name: (g: G) => string,
    children: (g: G) => string[],
    errorMessage: (view: GenerationView) => Error
}

/** This returns a promise. It returns a promise because a promise captures the idea of success and failure*/
export function calcGenerationsPromise<G>(genFns: GenerationFns<G>): (gs: G[]) => Promise<G[][]> {
    return (gs: G[]) => {
        let {remaining, generations} = calcGenerations(genFns)(gs)
        return Object.keys(remaining).length === 0 ? Promise.resolve(generations) : Promise.reject(genFns.errorMessage(remaining));
    }
}
interface GenerationsResult<G> {
    remaining: GenerationView,
    generations: G[][]
}

export function calcGenerations<G>(genFns: GenerationFns<G>): (gs: G[]) => GenerationsResult<G> {
    return (gs: G[]) => {
        let nameMap = calculateNameMap(genFns, gs)
        let view = generationView(genFns)(gs)
        let gens = mutateAndGetAllGens(view)
        let generations = applyNameMap(nameMap, gens);
        return {remaining: view, generations}
    }
}
const calculateNameMap = <G>(genFns: GenerationFns<G>, input: G[]) =>
    input.reduce((acc, g) => acc.set(genFns.name(g), g), new Map<string, G>());

const applyNameMap = <G>(nameMap: Map<string, G>, gens: string[][]): G[][] =>
    gens.map(gen => gen.sort().map(name => nameMap.get(name)));

function removeInPlace<T>(list: T[]) {
    return (t: T) => {
        let index = list.indexOf(t)
        if (index >= 0) list.splice(index, 1)
    }
}
function removeAllInPlace<T>(listToBeEdited: T[], listOfItemsToRemove: T[]) {
    listOfItemsToRemove.forEach(removeInPlace(listToBeEdited))
}
//OK... it's single threaded mutation. And I tried it with immutable and it was harder to read and understand

export function mutateAndGetAllGens(gen: GenerationView): string[][] {
    let thisGen = mutateAndGetGen0(gen)
    if (thisGen.length === 0) return []
    return [thisGen, ...mutateAndGetAllGens(gen)]
}
export function mutateAndGetGen0(gen: GenerationView): string[] {
    let gen0 = Object.keys(gen).filter(k => gen[k].length == 0)
    gen0.forEach(key => delete gen[key])
    Object.values(gen).forEach(values => removeAllInPlace(values, gen0))
    return gen0
}

export interface GenerationView {
    [name: string]: string[]
}
function getNames<G>(genFns: GenerationFns<G>, gs: G[]): Set<string> {
    let allNames = gs.reduce((acc, v) => acc.add(genFns.name(v)), new Set<string>())
    if (allNames.size != gs.length) throw new Error('duplicate names')
    return allNames
}
export function generationView<G>(genFns: GenerationFns<G>): (gs: G[]) => GenerationView {
    return gs => {
        let allNames = getNames(genFns, gs)
        let result: GenerationView = {}
        gs.forEach(v => result[genFns.name(v)] = genFns.children(v).filter(s => allNames.has(s)))
        return result
    }
}
