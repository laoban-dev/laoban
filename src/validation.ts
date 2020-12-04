import {CommandDefn, Config, ProjectDetailsAndDirectory, RawConfig, ScriptDefn} from "./config";
import * as fs from "fs";

function check(context: string, expectedType, json: any): (fieldName: string) => void {
    return fieldName => {
        if (!(json[fieldName])) throw new Error(`${context} ${fieldName} not found`)
        if (typeof json[fieldName] !== expectedType) throw new Error(`${context} ${fieldName} is a ${typeof [json[fieldName]]} and not ${expectedType}`)
    }
}

export function validateCommand(context: string, scriptName, command: any): command is CommandDefn {
    if (typeof command === 'string') return
    if (typeof command !== 'object') throw new Error(`${context} ${scriptName} comamnds is not object or a string`)
    let cont = context + " " + scriptName;
    check(cont, 'string', command)('command')
    // check(cont, 'string', command)('name')
}

export function validateScript(context: string, scriptName: string, json: any): json is ScriptDefn {
    let cont = context + " " + scriptName
    check(cont, 'string', json)('description')
    check(cont, 'object', json)('commands')
    if (!(Array.isArray(json.commands))) throw new Error(`${cont} comamnds is not an array`)
    json.commands.forEach(c => validateCommand(context, scriptName, c))
    return true
}

export function validateLaobanJson(json: any): json is RawConfig {
    // console.log('validate', JSON.stringify(json))
    let context = 'laoban.json';
    let cs = check(context, 'string', json)
    cs('templateDir')
    cs('versionFile')
    cs('log')
    cs('status')
    cs('profile')
    cs('packageManager')
    check(context, 'object', json)('scripts')
    Object.keys(json.scripts).forEach(k => validateScript(context, k, json.scripts[k]))
    return true
}


export interface ProjectDetails {
    "name": string,
    "description": string,
    template: string,
    "projectDetails": {
        "generation": number,
        "publish": boolean,
        "links": string[],
        "extraDeps": any,
        "extraDevDeps": any,
        extraBins: any
    }
}


export function validateProjectDetails(d: ProjectDetailsAndDirectory): d is ProjectDetailsAndDirectory {
    let context = `${d.directory}/project.details.json`;
    let cs = check(context, 'string', d.projectDetails)
    cs('name')
    cs('description')
    cs('template')
    check(context, 'object', d.projectDetails.projectDetails)('projectDetails')
    return true
}

function checkDirectoryExists(context: string, dir: string){
    if (!fs.lstatSync(dir).isDirectory()) throw new Error(`${context} ${dir} does not exists`)
}

export function validateConfigOnHardDrive(c: Config) {
    checkDirectoryExists('Laoban directory', c.laobanDirectory)
    checkDirectoryExists('template directory', c.templateDir)
}