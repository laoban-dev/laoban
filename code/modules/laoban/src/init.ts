import { combineRawConfigs, ConfigAndIssues } from "./config";
import path from "path";
import { output } from "./utils";
import { combineTwoObjects, FileOps, loadWithParents, NameAnd, parseJson, safeArray, safeObject } from "@phil-rice/utils";

interface ProjectDetailsJson {
  variableFiles: NameAnd<any>
  contents: any
}
function combineProjectDetailsJson ( i1: ProjectDetailsJson, i2: ProjectDetailsJson ): ProjectDetailsJson {
  const combineDetails = ( i1: any, i2: any ): any => combineTwoObjects ( safeObject ( i1?.details ), safeObject ( i2?.details ) );
  return {
    variableFiles: { ...safeObject ( i1?.variableFiles ), ...safeObject ( i2?.variableFiles ) },
    contents: { ...safeObject ( i1?.contents ), ...safeObject ( i2?.contents ), details: combineDetails ( i1?.contents, i2?.contents ) }
  }
}
export interface InitFileContents {
  parents?: string | string[]
  "laoban.json": any;
  "project.details.json": ProjectDetailsJson
}
export interface initFileContentsWithParsedLaobanJsonAndProjectDetails extends InitFileContents {
  laoban: any
  projectDetails: any
}
const combineInitContents = ( summary: ( i: InitFileContents ) => string ) => ( i1: InitFileContents, i2: InitFileContents ): InitFileContents => {
  let result = {
    "laoban.json": combineRawConfigs ( i1[ "laoban.json" ], i2[ "laoban.json" ] ),
    "project.details.json": combineProjectDetailsJson ( i1[ "project.details.json" ], i2[ "project.details.json" ] )
  };
  // console.log ( 'Merging      ', summary ( i1 ), )
  // console.log ( '   with      ', summary ( i2 ) )
  // console.log ( '   producing ', JSON.stringify(result) )
  return result
};


export async function findInitFileContents ( fileOps: FileOps, initUrl: string, cmd: any ): Promise<InitFileContents> {
  const types = cmd.types
  const listTypes = cmd.listtypes
  if ( types.length === 0 ) return Promise.reject ( `No types specified. Run with --listtypes to see available types` )

  const inits = parseJson ( `init ${initUrl}` ) ( await fileOps.loadFileOrUrl ( initUrl ) )
  if ( listTypes ) return Promise.reject ( `Listing types from  ${initUrl}\n${JSON.stringify ( inits, null, 2 )}` )
  const errors = types.filter ( t => Object.keys ( inits ).indexOf ( t ) === -1 )
  if ( errors.length > 0 ) return Promise.reject ( `The following types are not defined : ${errors.join ( ', ' )}. Legal values are ${JSON.stringify ( Object.keys ( inits ) )}` )

  const typeUrls = types.map ( t => inits[ t ] )
  const loadInits = loadWithParents<InitFileContents> ( ``,
    url => fileOps.loadFileOrUrl ( url + '/.init.json' ),
    parseJson,
    init => safeArray ( init.parents ),
    combineInitContents ( i => `Parents ${i.parents}` ) )

  const initContents: InitFileContents[] = await Promise.all <InitFileContents> ( typeUrls.map ( loadInits ) )
  return initContents.reduce ( combineInitContents ( i => `Reducing Parents ${i.parents}` ) )
}

export async function init ( fileOps: FileOps, configAndIssues: ConfigAndIssues, dir: string, cmd: any ): Promise<void> {
  const force = cmd.force
  const initContents = await findInitFileContents ( fileOps, configAndIssues.config.inits, cmd )
  // console.log ( 'initContents', JSON.stringify ( initContents, null, 2 ) )
  let file = path.join ( dir, 'laoban.json' );
  if ( !force && configAndIssues.config ) return Promise.resolve ( output ( configAndIssues ) ( `This project already has a laoban.json in ${configAndIssues.config.laobanDirectory}. Use --force if you need to create one here` ) )
  return fileOps.saveFile ( file, defaultLaobanJson )
}

export function initProjects ( fileOps: FileOps ) {

}

export const defaultLaobanJson = `{
  "packageManager": "yarn",
  "parents":        [
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/core.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.laoban.json",
    "https://raw.githubusercontent.com/phil-rice/laoban/master/common/laoban.json/typescript.publish.laoban.json"
  ]
}`