import {CommandDefn, Config, RawConfig, ScriptDefn, ScriptDefns, ScriptDetails, ScriptProcessor} from "./config";
import * as path from "path";
import {loabanConfigName} from "./Files";

/** if dic has a.b.c, then if s is a.b.c, this return dic.a.b.c. Or undefined */
function find(dic: any, s: string) {
    return dic[s]
}


/** ref is like ${xxx} and this returns dic[xxx]. If the variable doesn't exist it is left alone... */
function replaceVar(dic: any, ref: string): string {
    let i = ref.slice(2, ref.length - 1);
    let parts = i.split('.')
    // console.log('dic', dic)
    // console.log('parts', parts)
    try {
        let result = parts.reduce((acc, part) => acc[part], dic)
        return result ? result : ref
    } catch (e) {return ref}
}
/** If the string has ${a} in it, then that is replaced by the dic entry */
export function derefence(dic: any, s: string) {
    const regex = /(\$\{[^}]*\})/g
    let groups = s.match(regex)
    if (groups) {
        // console.log("    deref", s, groups)
        let result = groups.reduce((acc, v) => acc.replace(v, replaceVar(dic, v)), s)
        // console.log("      result", result)
        return result
    }
    return s
}
function cleanUpCommandString(dic: any,): (s: string) => string {
    return s => derefence(dic, s)
}
function isCommand(x: (string | CommandDefn)): x is CommandDefn {
    return typeof x === 'object'
}
export function cleanUpCommand(command: (string | CommandDefn)): CommandDefn {
    return isCommand(command) ?
        ({...command, command: command.command}) :
        ({name: '', command: command})
}

function cleanUpScript(dic: any): (scriptName: string, defn: ScriptDefn) => ScriptDetails {
    return (scriptName, defn) => ({
        name: derefence(dic, scriptName),
        description: derefence(dic, defn.description),
        guard: defn.guard,
        commands: defn.commands.map(cleanUpCommand)
    })
}
function addScripts(dic: any, scripts: ScriptDefns) {
    var result: ScriptDetails[] = []
    for (const scriptName in scripts)
        result.push(cleanUpScript(dic)(scriptName, scripts[scriptName]))
    return result;
}
export function configProcessor(laoban: string, rawConfig: RawConfig): Config {
    var result: any = {laobanDirectory: laoban, laobanConfig: path.join(laoban, loabanConfigName)}
    function add(name: string, raw: any) {
        result[name] = derefence(result, raw[name])
    }
    add("templateDir", rawConfig)
    add("log", rawConfig)
    add("status", rawConfig)
    add("packageManager", rawConfig)
    add("scriptDir", rawConfig)
    for (const k in rawConfig.variables) add(k, rawConfig.variables)
    result.scripts = addScripts(result, rawConfig.scripts);
    return result

}

