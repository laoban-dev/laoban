import {Config} from "./config";
import * as fs from "fs";
import * as path from "path";

export function loadProfile(config: Config, directory: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(directory, config.profile), (err, data) => {
            if (err) reject(err)
            resolve(data.toString())
        })
    })
}

export interface ProfileMap {
    [key: string]: number[]
}
export interface Profile {
    directory: string,
    values: { [key: string]: number[] }
}
export function findProfilesFromString(directory: string): (s: string) => Profile {
    return s => {
        let result: ProfileMap = {}
        s.split('\n').forEach(line => {
            let parts = line.split(" ")
            let key = parts.slice(0, 2).join(' ')
            let existing: number[] = result[key]
            let duration = Number(parts[2])
            if (existing) existing.push(duration)
            else result[key] = [duration]
            //     // console.log(result)
        })
        return ({directory: directory, values: result})
    }
}