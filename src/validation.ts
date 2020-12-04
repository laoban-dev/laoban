import {CommandDefn, Config, ProjectDetailsAndDirectory, RawConfig, ScriptDefn} from "./config";
import * as fs from "fs";
import * as path from "path";

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

function checkDirectoryExists(context: string, dir: string) {
    function error() { throw new Error(`${context} ${dir} does not exist`)}
    try {
        if (!fs.lstatSync(dir).isDirectory()) error(); // ok not the best code...double exception
    } catch (e) { error()}
}

export function validateConfigOnHardDrive(c: Config, pds: ProjectDetailsAndDirectory[]) {
    checkDirectoryExists('Laoban directory', c.laobanDirectory)
    checkDirectoryExists('template directory', c.templateDir)
    pds.forEach(t => checkDirectoryExists(`project.json.details in ${t.directory} has template ${t.projectDetails.template}. `, path.join(c.templateDir, t.projectDetails.template)))
    let names = pds.map(p => p.projectDetails.name).sort()
    pds.forEach(p => p.projectDetails.projectDetails.links.forEach(l => {
        if (!names.includes(l)) throw new Error(`${p.directory}/project.details.json has a link to ${l} which is not a known project name. Legal names are ${names}`)
    }))
}