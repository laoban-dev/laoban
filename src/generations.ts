import {ProjectDetails, ProjectDetailsAndDirectory} from "./config";
import {Maps} from "./utils";

interface Tree {
    [name: string]: Set<string>
}
export function calculateGenerations(pds: ProjectDetails[]) {
    let gen0 = getChildrenRecurse(pds, [])
    // let gen1 = getChildrenRecurse(pds, gen0, map)
    console.log("gen0", gen0)
    let gen1 = getChildrenRecurse(pds, gen0)
    console.log("gen1", gen1)
    let gen2 = getChildrenRecurse(pds, [...gen0, ...gen1])
    console.log("gen2", gen2)
}

interface GenerationCalc {
    existing: string[],
    generations: string[][]
}
interface Generations{
    generations: ProjectDetailsAndDirectory[][],
    errors?: string
}


export function calcAllGeneration(pds: ProjectDetails[], start: GenerationCalc): GenerationCalc {
    let newGen = getChildrenRecurse(pds, start.existing)
    if (newGen.length == 0) return start;
    return calcAllGeneration(pds, {existing: [...start.existing, ...newGen], generations: [...start.generations, newGen]})
}
export function prettyPrintGenerations(pds: ProjectDetails[], gen: GenerationCalc) {
    gen.generations.forEach((g,i) =>{
        console.log('Generation', i)
        console.log('  ', g.join(", "))
    })
    let thisTree = {}
    let missing = new Set(pds.map(p => p.name))
    gen.generations.forEach(g => g.forEach(n => missing.delete(n)))
    if (missing.size>0) {
        console.log()
        console.log("Missing: can't put in a generation")
        console.log(missing)
    }
}

function getChildrenRecurse(pds: ProjectDetails[], existing: string[]) {
    let thisTree = {}
    pds.forEach(p => thisTree[p.name] = new Set(p.projectDetails.links))

    // console.log('raw', thisTree)
    // console.log('existing', existing)
    for (let k in thisTree) {
        if (existing.includes(k)) delete thisTree[k]
        else {
            let values = thisTree[k]
            existing.forEach(e => values.delete(e))
        }
    }
    // console.log('tree after existing removed', thisTree)

    for (let k in thisTree) {
        if (thisTree[k].size > 0)
            delete thisTree[k]
    }
    return [...Object.keys(thisTree)].sort()

}
// function calculateRoots<V>(map: Map<V,V[]>, ignore: V[]){
//     allChildren = map.keys().reduce((acc, v) => )
//
// }