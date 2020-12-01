import * as fs from "fs";
import {ParsedPath} from "path";
import * as path from "path";

export let loabanConfigName = 'laoban.json'
export function laobanFile(dir: string){ return path.join(dir, loabanConfigName)}
export function findLaoban(directory: string) {
    let fullName = path.join(directory, loabanConfigName);
    if (fs.existsSync(fullName)) return directory
    let parse = path.parse(directory)
    if (parse.dir === parse.root) {throw Error('Cannot find laoban.json')}
    return findLaoban(parse.dir)
}