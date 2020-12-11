import path from "path";
import fs from "fs";
import * as cp from 'child_process'
import {findLaoban} from "./Files";
import os from "os";


export let testRoot = path.resolve(findLaoban(process.cwd()), '..', 'tests');
export let fullPathsOfTestDirs = () => dirsIn('test').map(d => path.resolve(d))
export let pwd = os.type() == 'Windows' ? 'echo %CD%' : 'pwd'


export function execute(cwd: string, cmd: string): Promise<string> {
    // console.log('execute', cwd, cmd)
    return new Promise<string>(resolve => {
        cp.exec(cmd, {cwd}, (error, stdout, stdErr) => {
            resolve((stdout.toString() + "\n" + stdErr).toString())
        })
    })
}
export function toArrayReplacingRoot(s: string): string[] {
    let rootMatch = new RegExp(testRoot, "g")
    return s.split('\n').map(s => s.trim()).map(s => s.replace(rootMatch, "<root>")).filter(s => s.length > 0)
}


export function dirsIn(root: string) {
    return fs.readdirSync(root).//
        map(testDirName => path.join(testRoot, testDirName)).//
        filter(d => fs.statSync(d).isDirectory()).//
        map(testDir => path.relative(testRoot, testDir))

}
