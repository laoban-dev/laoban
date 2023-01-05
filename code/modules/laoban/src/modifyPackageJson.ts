import {Config, ConfigWithDebug, ProjectDetails} from "./config";
import * as path from "path";
import * as fs from "fs";
// @ts-ignore
import {Debug} from "@laoban/debug";

// export function loadPackageJsonInTargetDirectory( config: ConfigWithDebug, projectDetails: ProjectDetails): Promise<any> {
//     let file = path.join(projectDetails.deta, projectDetails.template, 'package.json')
//     try {
//         let data = fs.readFileSync(file) // not sure why readFile async not working: silent fail
//         return Promise.resolve(JSON.parse(data.toString()))
//     } catch (err) {
//         return Promise.reject(Error("Could not find template file" + file + '\n' + err))
//     }
// }

//
// return new Promise<any>((resolve, reject) => fs.readFile(file, (err, data) => {
//     debug.debug('update', () => '              have read ' + file + '\n' + err)
//     if (err) reject(err)
//     if (data == undefined) {return reject(Error("Could not find template file" + file))}
//     resolve(JSON.parse(data.toString()))
// }))
// }

export function loadVersionFile(config: Config): Promise<string> {
    let file = config.versionFile
    try {
        return Promise.resolve(fs.readFileSync(file).toString())
    } catch (err) {
        return Promise.reject(Error("Could not find version file" + file + "\n" + err))

    }
}
//
//     return new Promise<any>((resolve, reject) => fs.readFile(file, (err, data) => {
//         if (err) reject(err)
//         if (data) resolve(data.toString())
//     }))
// }
export function saveProjectJsonFile(directory: string, packageJson: any): Promise<void> {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(packageJson, null, 2) + "\n")
    return Promise.resolve()
}

export function modifyPackageJson(raw: any, version: string, projectDetails: ProjectDetails) {
    let result = {...raw}
    Object.assign(result, projectDetails)
    add(result, 'dependencies', projectDetails.details.extraDeps)
    let links = projectDetails.details.links ? projectDetails.details.links : [];
    links.map(l => result['dependencies'][l] = version)
    add(result, 'devDependencies', projectDetails.details.extraDevDeps)
    add(result, 'bin', projectDetails.details.extraBins)
    delete result.projectDetails
    result.version = version
    result.name = projectDetails.name
    result.description = projectDetails.description
    return result
}

function add(a: any, name: string, b: any) {
    if (b) {
        let existing = a[name]
        let cleanExisting = existing ? existing : {}
        let cleanB = b ? b : {}
        let result = {...cleanExisting, ...cleanB};
        if (Object.keys(result).length === 0) delete a['name']
        else a[name] = result
    }
}
