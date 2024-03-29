//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import {StringAndWidth, Strings} from "./utils";
import * as fs from "fs";
import { Path } from "@laoban/fileops";

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
        if (groups && groups[2]) map.set(groups[2], line)
    })
    return map
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


interface PrettyPrintStatusData {
    commandsTitles: StringAndWidth[]
    directories: string[]
    directoriesWidth: number
    directoryToCommandToData: Map<string, Map<string, string>>
}
export function toPrettyPrintData(path: Path, laobanDirectory: string, sds: StatusDetails[]): PrettyPrintStatusData {
    let directories = [...new Set(sds.map(sd => path.relative(laobanDirectory,sd.directory)))]

    let directoriesWidth = Strings.maxLength(directories)
    let commandTitles = [...new Set(sds.map(sd => sd.command))].sort()
    let commandsTitles = ['', ...commandTitles].map(d => ({value: d, width: Math.max(5, d.length)}))  //later might want more sophisticated
    let directoryToCommandToData = new Map<string, Map<string, string>>()
    sds.forEach(sd => {
        const dir = path.relative(laobanDirectory,sd.directory)
        let existingCommandToData = directoryToCommandToData.get(dir)
        let map: Map<string, string> = existingCommandToData ? existingCommandToData : new Map<string, string>()
        map.set(sd.command, sd.status)
        directoryToCommandToData.set(dir, map)
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

