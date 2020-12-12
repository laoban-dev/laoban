import * as fs from "fs";
import * as fse from "fs-extra";
import * as path from "path";
import {Config, HasLaobanDirectory, ProjectDetailsAndDirectory} from "./config";
import {flatten} from "./utils";


export let loabanConfigName = 'laoban.json'
export let projectDetailsFile = 'project.details.json'

export function laobanFile(dir: string) { return path.join(dir, loabanConfigName)}

export function copyTemplateDirectory(config: Config, template: string, target: string): Promise<void> {
    return fse.copy(path.join(config.templateDir, template), target)
}
export function isProjectDirectory(directory: string) {
    return fs.existsSync(path.join(directory, projectDetailsFile))
}
export function findLaoban(directory: string) {
    function find(dir: string) {
        let fullName = path.join(dir, loabanConfigName);
        if (fs.existsSync(fullName)) return dir
        let parse = path.parse(dir)
        if (parse.dir === parse.root) {throw Error(`Cannot find laoban.json. Started looking in ${directory}`)}
        return find(parse.dir)
    }
    return find(directory)
}

interface ProjectDetailOptions {
    all?: boolean,
    one?: boolean,
    projects?: string
}
export class ProjectDetailFiles {

    static workOutProjectDetails(hasRoot: HasLaobanDirectory, options: ProjectDetailOptions): Promise<ProjectDetailsAndDirectory[]> {
        let root = hasRoot.laobanDirectory
        if (options.projects) return this.findAndLoadProjectDetailsFromChildren(root).then(pd => pd.filter(p => p.directory.match(options.projects)))
        if (options.all) return this.findAndLoadProjectDetailsFromChildren(root);
        if (options.one) return this.loadProjectDetails(process.cwd()).then(x => [x])

        return this.loadProjectDetails(process.cwd()).then(pd =>
            pd.projectDetails ? this.loadProjectDetails(process.cwd()).then(x => [x]) : this.findAndLoadProjectDetailsFromChildren(root))
    }


    static findAndLoadProjectDetailsFromChildren(root: string): Promise<ProjectDetailsAndDirectory[]> {
        return Promise.all(this.findProjectDirectories(root).map(this.loadProjectDetails))
    }

    static loadProjectDetails(root: string): Promise<ProjectDetailsAndDirectory> {
        let rootAndFileName = path.join(root, projectDetailsFile);
        return new Promise<ProjectDetailsAndDirectory>((resolve, reject) => {
            fs.readFile(rootAndFileName, (err, data) => {
                    if (err) {resolve({directory: root})} else {
                        try {
                            let projectDetails = JSON.parse(data.toString());
                            resolve({directory: root, projectDetails: projectDetails})
                        } catch (e) {
                            return reject(new Error(`Cannot parse the file ${rootAndFileName}\n${e}`))
                        }
                    }
                }
            )
        })
    }

    static findProjectDirectories(root: string): string[] {
        let rootAndFileName = path.join(root, projectDetailsFile);
        let result = fs.existsSync(rootAndFileName) ? [root] : []
        let children: string[][] = fs.readdirSync(root).map((file, index) => {
            if (file !== 'node_modules' && file !== '.git') {
                const curPath = path.join(root, file);
                if (fs.lstatSync(curPath).isDirectory())
                    return this.findProjectDirectories(curPath)
            }
            return []
        });
        return flatten([result, ...children])
    }
}


