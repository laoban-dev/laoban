import * as fs from "fs";
import * as fse from "fs-extra";
import * as path from "path";
import {ConfigWithDebug, HasLaobanDirectory, ProjectDetailsAndDirectory} from "./config";
import {flatten} from "./utils";
// @ts-ignore
import {Debug} from "@phil-rice/debug";



export let loabanConfigName = 'laoban.json'
export let projectDetailsFile = 'project.details.json'

export function laobanFile(dir: string) { return path.join(dir, loabanConfigName)}

export function copyTemplateDirectory(config: ConfigWithDebug, template: string, target: string): Promise<void> {
    let src = path.join(config.templateDir, template);
    let d = config.debug('update');
    return d.k(() => `copyTemplateDirectory directory from ${src}, to ${target}`, () => {
        fse.copySync(src, target)
        // no idea why the fse.copy doesn't work here... it just fails silently
        return Promise.resolve()
    })
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
    projects?: string,
}
export class ProjectDetailFiles {
    static workOutProjectDetails(hasRoot: HasLaobanDirectory & { debug: Debug }, options: ProjectDetailOptions): Promise<ProjectDetailsAndDirectory[]> {
        let p = hasRoot.debug('projects')
        let root = hasRoot.laobanDirectory
        // p.message(() =>['p.message'])
        function find() {
            if (options.projects) return p.k(() => `options.projects= [${options.projects}]`, () =>
                ProjectDetailFiles.findAndLoadProjectDetailsFromChildren(root).then(pd => pd.filter(p => p.directory.match(options.projects))))
            if (options.all) return p.k(() => "options.allProjects", () => ProjectDetailFiles.findAndLoadProjectDetailsFromChildren(root));
            if (options.one) return p.k(() => "optionsOneProject", () => ProjectDetailFiles.loadProjectDetails(process.cwd()).then(x => [x]))
            return ProjectDetailFiles.loadProjectDetails(process.cwd()).then(pd => {
                    p.message(() => ["using default project rules. Looking in ", process.cwd(), 'pd.details', pd.projectDetails ? pd.projectDetails.name : 'No project.details.json found'])
                    return pd.projectDetails ?
                        p.k(() => 'Using project details from process.cwd()', () => ProjectDetailFiles.loadProjectDetails(process.cwd())).then(x => [x]) :
                        p.k(() => 'Using project details under root', () => ProjectDetailFiles.findAndLoadProjectDetailsFromChildren(root))
                }
            )
        }
        return find().then(pds => {
            p.message(() => ['found', ...pds.map(p => p.directory)]);
            return pds
        })
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


