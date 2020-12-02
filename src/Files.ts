import * as fs from "fs";
import {ParsedPath} from "path";
import * as path from "path";
import {Strings} from "./utils";
import {ProjectDetailsAndDirectory} from "./config";


export let loabanConfigName = 'laoban.json'
export let projectDetailsFile = 'project.details.json'

export function laobanFile(dir: string) { return path.join(dir, loabanConfigName)}

export function isProjectDirectory(directory: string) {
    return fs.existsSync(path.join(directory, projectDetailsFile))
}
export function findLaoban(directory: string) {
    let fullName = path.join(directory, loabanConfigName);
    if (fs.existsSync(fullName)) return directory
    let parse = path.parse(directory)
    if (parse.dir === parse.root) {throw Error('Cannot find laoban.json')}
    return findLaoban(parse.dir)
}

export class Files {
    static loadProjectDetails(root: string, projectDetailsFile: string): ProjectDetailsAndDirectory {
        return ({directory: root, projectDetails: JSON.parse(fs.readFileSync(projectDetailsFile).toString())})
    }
    static findProjectFiles(root: string): ProjectDetailsAndDirectory[] {
        let rootAndFileName = path.join(root, projectDetailsFile);
        let result = fs.existsSync(rootAndFileName) ? [Files.loadProjectDetails(root,rootAndFileName)] : []
        let children: ProjectDetailsAndDirectory[][] = fs.readdirSync(root).map((file, index) => {
            if (file !== 'node_modules' && file !== '.git') {
                const curPath = path.join(root, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    return this.findProjectFiles(curPath)
                }
            }
            return []
        });
        return [].concat.apply(result, children)
    }

}

export function compactStatus(statusFile: string): any {
    let lines = fs.readFileSync(statusFile).toString()
    let map = new Map<string, string>()
    lines.split("\n").forEach(line => {
        let groups = line.split(" ")
        if (groups && groups[2])
            // console.log('compact', groups)
            map.set(groups[2], line)


    })
    return map
}

export function writeCompactedStatus(statusFile: string, statusMap: Map<string, string>) {
    let keys = [...statusMap.keys()].sort()
    let compacted = keys.map(k => statusMap.get(k)).join("\n") + "\n"
    fs.writeFile(statusFile, compacted, err => {
        if (err) console.log('error compacting status', statusFile, statusMap, compacted)
    })

}

export function printStatus(directory: string, statusMap: Map<string, string>) {
    let regex = /^([^ ]*) ([^ ]*) (.*)/
    let keys = [...statusMap.keys()]
    keys.sort()
    let width = 10// Strings.maxLength(keys)
    console.log(directory)
    keys.forEach(k => {
        let value = statusMap.get(k)
        let groups = value.match(regex)
        if (groups)
            console.log('  ', k.padEnd(width), groups[2].padEnd(5), groups[1])
        else
            console.log('  Status file error', value)
    })

}