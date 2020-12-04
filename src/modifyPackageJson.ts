import {Config, ProjectDetails} from "./config";
import * as path from "path";
import * as fs from "fs";

export function loadPackageJsonInTemplateDirectory(config: Config, projectDetails: ProjectDetails): Promise<any> {
    let file = path.join(config.templateDir, projectDetails.template, 'package.json')
    return new Promise<any>((resolve, reject) => fs.readFile(file, (err, data) => {
        if (err) reject(err)
        if (data == undefined) {return reject(Error("Could not find template file" + file))}
        // console.log(file, data, data == undefined)
        resolve(JSON.parse(data.toString()))
    }))
}

export function loadVersionFile(config: Config): Promise<string> {
    let file = config.versionFile
    return new Promise<any>((resolve, reject) => fs.readFile(file, (err, data) => {
        if (err) reject(err)
        if (data) resolve(data.toString())
        else reject(Error("Could not find version file" + file))
    }))
}
export function saveProjectJsonFile(directory: string, packageJson: any) {
    return new Promise<void>((resolve, reject) => fs.writeFile(path.join(directory, 'package.json'),
        JSON.stringify(packageJson, null, 2) + "\n", (err) => {
            if (err) reject(err)
            else resolve()
        }))
}

export function modifyPackageJson(raw: any, version: string, projectDetails: ProjectDetails) {
    let result = {...raw}
    Object.assign(result, projectDetails)
    add(result, 'dependencies', projectDetails.projectDetails.extraDeps)
    projectDetails.projectDetails.links.map(l => result['dependencies'][l] = version)
    add(result, 'devDependencies', projectDetails.projectDetails.extraDevDeps)
    add(result, 'bin', projectDetails.projectDetails.extraBins)
    delete result.projectDetails
    result.version = version
    result.name = projectDetails.name
    result.description = projectDetails.description
    return result
}

function add(a: any, name: string, b: any) {
    let existing = a[name]
    let cleanExisting = existing ? existing : {}
    let cleanB = b ? b : {}
    let result = {...cleanExisting, ...cleanB};
    if (Object.keys(result).length === 0) delete a['name']
    else a[name] = result
    // console.log("add", a, name, b)
}

//  jq --sort-keys --argjson details "$(cat $detailsFile)" '
//       (. + $details) +
//       ({dependencies:
//          (.dependencies +        ($details.projectDetails.extraDeps)   +
//          (reduce $details.projectDetails.links[]? as $i ({}; .[$i] = "<version>" )))
//       }) +
//       ({devDependencies: (.devDependencies + $details.projectDetails.extraDevDeps)}) +
//       ({bin: ((if has("bin") then .bin else {} end) + $details.projectDetails.extraBins )})
//        ' < "$templateDirectory/package.json"