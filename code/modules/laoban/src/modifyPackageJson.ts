import {Config, ConfigWithDebug, PackageDetails} from "./config";
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
export function savePackageJsonFile( directory: string, packageJson: any): Promise<void> {
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(packageJson, null, 2) + "\n")
    return Promise.resolve()
}


export function modifyPackageJson(raw: any, version: string, packageDetails: PackageDetails) {
    let result = {...raw}
    Object.assign(result, packageDetails)
    add(result, 'dependencies', packageDetails.details.extraDeps)
    let links = packageDetails.details.links ? packageDetails.details.links : [];
    links.map(l => result['dependencies'][l] = version)
    add(result, 'devDependencies', packageDetails.details.extraDevDeps)
    add(result, 'bin', packageDetails.details.extraBins)
    delete result.packageDetails
    result.version = version
    result.name = packageDetails.name
    result.description = packageDetails.description
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
