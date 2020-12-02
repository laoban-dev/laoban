import * as fs from "fs";
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

export class ProjectDetailFiles {
    static findAndLoadProjectDetails(root: string, all: boolean): Promise<ProjectDetailsAndDirectory[]> {
        return all ? this.findAndLoadProjectDetailsFromChildren(root) : this.loadProjectDetails(root).then(x => [x])
    }

    static findAndLoadProjectDetailsFromChildren(root: string): Promise<ProjectDetailsAndDirectory[]> {return Promise.all(this.findProjectDirectories(root).map(this.loadProjectDetails))}

    static loadProjectDetails(root: string): Promise<ProjectDetailsAndDirectory> {
        let rootAndFileName = path.join(root, projectDetailsFile);
        return new Promise<ProjectDetailsAndDirectory>((resolve) => {
            fs.readFile(rootAndFileName, (err, data) => {
                if (err) {resolve({directory: root})} else
                    resolve({directory: root, projectDetails: JSON.parse(fs.readFileSync(projectDetailsFile).toString())})
            })
        })
    }

    static findProjectDirectories(root: string): string[] {
        let rootAndFileName = path.join(root, projectDetailsFile);
        let result = fs.existsSync(rootAndFileName) ? [root] : []
        let children: string[][] = fs.readdirSync(root).map((file, index) => {
            if (file !== 'node_modules' && file !== '.git') {
                const curPath = path.join(root, file);
                if (fs.lstatSync(curPath).isDirectory())
                    return this.findProjectDirectories(curPath)
            }
            return []
        });
        return [].concat.apply(result, children)
    }
}


export class Files {
    static loadProjectDetails(root: string, projectDetailsFile: string): ProjectDetailsAndDirectory {
        return ({directory: root, projectDetails: JSON.parse(fs.readFileSync(projectDetailsFile).toString())})
    }
    static findProjectFiles(root: string): ProjectDetailsAndDirectory[] {
        let rootAndFileName = path.join(root, projectDetailsFile);
        let result = fs.existsSync(rootAndFileName) ? [Files.loadProjectDetails(root, rootAndFileName)] : []
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

function readOrBlank(file: string): string {
    try {
        return fs.readFileSync(file).toString()
    } catch (e) {return ""}
}
export function compactStatus(statusFile: string): Map<string, string> {
    let lines = readOrBlank(statusFile)
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

interface StatusDetails {
    directory: string,
    command: string,
    status: string,
    timestamp: string
}
interface CommandAndStatusDetails {
    command: string,
    details: StatusDetails[]
}

export interface DirectoryAndCompactedStatusMap {
    directory: string,
    compactedStatusMap: Map<string, string>
}


function stringToStatusDetails(directory: string, s: string): StatusDetails {
    let regex = /^([^ ]*) ([^ ]*) (.*)/
    let groups = s.match(regex)
    let result = {directory: directory, timestamp: groups[1], status: groups[2], command: groups[3]};
    return result
}
export function toStatusDetails(ds: DirectoryAndCompactedStatusMap[]): StatusDetails[] {
    let result: StatusDetails[][] = ds.map(d => [...d.compactedStatusMap.keys()].map(command => stringToStatusDetails(d.directory, d.compactedStatusMap.get(command))))
    return [].concat(...result)
}

interface StringAndWidth {
    value: string,
    width: number
}
interface PrettyPrintStatusData {
    commandsTitles: StringAndWidth[]
    directories: string[]
    directoriesWidth: number
    directoryToCommandToData: Map<string, Map<string, string>>
}
export function toPrettyPrintData(sds: StatusDetails[]): PrettyPrintStatusData {
    let directories = [...new Set(sds.map(sd => sd.directory))]
    let directoriesWidth = Strings.maxLength(directories)
    let commandTitles = [...new Set(sds.map(sd => sd.command))].sort()
    let commandsTitles = ['', ...commandTitles].map(d => ({value: d, width: Math.max(5, d.length)}))  //later might want more sophisticated
    let directoryToCommandToData = new Map<string, Map<string, string>>()
    sds.forEach(sd => {
        let existingCommandToData = directoryToCommandToData.get(sd.directory)
        let map: Map<string, string> = existingCommandToData ? existingCommandToData : new Map<string, string>()
        map.set(sd.command, sd.status)
        directoryToCommandToData.set(sd.directory, map)
    })
    return ({commandsTitles: commandsTitles, directories: directories, directoriesWidth: directoriesWidth, directoryToCommandToData: directoryToCommandToData})
}
export function prettyPrintData(pretty: PrettyPrintStatusData) {
    console.log(''.padEnd(pretty.directoriesWidth), pretty.commandsTitles.map(ct => ct.value.padEnd(ct.width)).join(' '))
    pretty.directories.forEach(d => console.log(d.padEnd(pretty.directoriesWidth), pretty.commandsTitles.map(ct => {
        let value = pretty.directoryToCommandToData.get(d).get(ct.value);
        return (value ? value : "").padEnd(ct.width)
    }).join(' ')))
}