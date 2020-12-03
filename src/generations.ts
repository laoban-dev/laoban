import {ProjectDetails} from "./config";
import {Maps} from "./utils";

export function getChildren(pds: ProjectDetails[]) {
    let map = new Map();
    return getChildrenRecurse(pds, map)
    return map

}
function getChildrenRecurse(pds: ProjectDetails[], children: Map<string, string[]>) {
    pds.forEach(p => Maps.addAll(children, p.name, p.projectDetails.links))
}

// function calculateRoots<V>(map: Map<V,V[]>, ignore: V[]){
//     allChildren = map.keys().reduce((acc, v) => )
//
// }