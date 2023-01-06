import * as fs from "fs";
import * as path from "path";
import { HasLaobanDirectory, ProjectDetailsAndDirectory } from "./config";
import { Debug } from "@laoban/debug";
import { childDirs, FileOps, findMatchingK } from "@laoban/utils";


export let loabanConfigName = 'laoban.json'
export let loabanConfigTestName = '.laoban.test.json'
export let packageDetailsFile = 'project.details.json'
export let packageDetailsTestFile = '.project.details.test.json'

export function laobanFile ( dir: string ) { return path.join ( dir, loabanConfigName )}

export function findLaobanOrUndefined ( directory: string ): string | undefined {
  function find ( dir: string ): string {
    let fullName = path.join ( dir, loabanConfigName );
    if ( fs.existsSync ( fullName ) ) return dir
    let parse = path.parse ( dir )
    if ( parse.dir === parse.root ) return undefined
    return find ( parse.dir )
  }
  return find ( directory )
}
export function findLaoban ( directory: string ): string {
  const dir = findLaobanOrUndefined ( directory )
  if ( dir === undefined ) {throw Error ( `Cannot find laoban.json. Started looking in ${directory}` )}
  return dir
}

interface ProjectDetailOptions {
  all?: boolean,
  one?: boolean,
  projects?: string,
}
export class ProjectDetailFiles {
  static workOutProjectDetails ( fileOps: FileOps, hasRoot: HasLaobanDirectory & { debug: Debug }, options: ProjectDetailOptions ): Promise<ProjectDetailsAndDirectory[]> {
    let p = hasRoot.debug ( 'projects' )
    let root = hasRoot.laobanDirectory
    // p.message(() =>['p.message'])
    function find () {
      if ( options.projects ) return p.k ( () => `options.projects= [${options.projects}]`, () =>
        ProjectDetailFiles.findAndLoadProjectDetailsFromChildren ( fileOps, root ).then ( pd => pd.filter ( p => p.directory.match ( options.projects ) ) ) )
      if ( options.all ) return p.k ( () => "options.allProjects", () => ProjectDetailFiles.findAndLoadProjectDetailsFromChildren ( fileOps, root ) );
      if ( options.one ) return p.k ( () => "optionsOneProject", () => ProjectDetailFiles.loadProjectDetails ( process.cwd () ).then ( x => [ x ] ) )
      return ProjectDetailFiles.loadProjectDetails ( process.cwd () ).then ( pd => {
          p.message ( () => [ "using default project rules. Looking in ", process.cwd (), 'pd.details', pd.projectDetails ? pd.projectDetails.name : `No ${packageDetailsFile} found` ] )
          return pd.projectDetails ?
            p.k ( () => 'Using project details from process.cwd()', () => ProjectDetailFiles.loadProjectDetails ( process.cwd () ) ).then ( x => [ x ] ) :
            p.k ( () => 'Using project details under root', () => ProjectDetailFiles.findAndLoadProjectDetailsFromChildren ( fileOps, root ) )
        }
      )
    }
    return find ().then ( pds => {
      p.message ( () => [ 'found', ...pds.map ( p => p.directory ) ] );
      return pds
    } )
  }


  static async findAndLoadProjectDetailsFromChildren ( fileOps: FileOps, root: string ): Promise<ProjectDetailsAndDirectory[]> {
    let dirs = await this.findProjectDirectories ( fileOps ) ( root );
    return Promise.all ( dirs.map ( this.loadProjectDetails ) )
  }

  static loadProjectDetails ( root: string ): Promise<ProjectDetailsAndDirectory> {
    let rootAndFileName = path.join ( root, packageDetailsFile );
    return new Promise<ProjectDetailsAndDirectory> ( ( resolve, reject ) => {
      fs.readFile ( rootAndFileName, ( err, data ) => {
          if ( err ) {resolve ( { directory: root } )} else {
            try {
              let projectDetails = JSON.parse ( data.toString () );
              resolve ( { directory: root, projectDetails: projectDetails } )
            } catch ( e ) {
              return reject ( new Error ( `Cannot parse the file ${rootAndFileName}\n${e}` ) )
            }
          }
        }
      )
    } )
  }

  static findProjectDirectories = ( fileOps: FileOps ) => async ( root: string ): Promise<string[]> => {
    const findDescs = childDirs ( fileOps, s => s === 'node_modules' || s === '.git' || s === '.session' )
    const descs = await findDescs ( root )

    let result = findMatchingK ( descs, s => fileOps.isFile ( path.join ( s, packageDetailsFile ) ) );
    return result
  };
}


