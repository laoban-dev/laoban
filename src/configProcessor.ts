import {Config, RawConfig} from "./config";
import * as path from "path";
import {loabanConfigName} from "./Files";

/** if dic has a.b.c, then if s is a.b.c, this return dic.a.b.c. Or undefined */
function find(dic: any, s: string) {
    return dic[s]
}


/** ref is like ${xxx} and this returns dic[xxx] */
function replaceVar(name: string, dic: any,  ref: string) : string {
        let i = ref.slice(2, ref.length - 1);
        let result = dic[i];
        if (result)
            return result
        console.log('dic', dic)
        throw new Error(`Value for ${name} references illegal variable ${i}`)
}
/** If the string has ${a.b.c} in it, then that is replaced by the dic entry */
function derefence(name: string, dic: any, s: string) {
    const regex = /(\$\{.*\})/g
    let groups = s.match(regex)
    if (groups) {
        console.log("    deref", s, groups)
        let result = groups.reduce((acc,v) => acc.replace(v, replaceVar(name, dic, v)), s)
        console.log("      result", result)
        return result
    }
    return s
}

export function configProcessor(laoban: string, rawConfig: RawConfig): Config {
    var result: any = {directory: laoban, laobanConfig: path.join(laoban, loabanConfigName)}
    function add(name: string, raw: any) {
        result[name] = derefence(name, result, raw[name])
    }
    add("templateDir", rawConfig)
    add("globalLog", rawConfig)
    add("projectLog", rawConfig)
    add("packageManager", rawConfig)
    add("scriptDir", rawConfig)
    for (const k in rawConfig.variables) add(k, rawConfig.variables)
    return result

}

