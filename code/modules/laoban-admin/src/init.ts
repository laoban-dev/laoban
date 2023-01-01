import { combineTwoObjects, FileOps, loadWithParents, NameAnd, parseJson, safeArray, safeObject } from "@phil-rice/utils";
import { InitSuggestions, isSuccessfulInitSuggestions, suggestInit } from "./status";
import { derefence, dollarsBracesVarDefn } from "@phil-rice/variables";
import { LocationAnd } from "./fileLocations";
import path from "path";
import { includeAndTransformFile } from "laoban/dist/src/update";
import { combineRawConfigs } from "laoban/dist/src/config";

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

async function createLaobanJsonContents ( initFileContents: InitFileContents, suggestions: InitSuggestions ): Promise<string> {
  let rawLaoban = JSON.stringify ( initFileContents[ "laoban.json" ], null, 2 );
  const dic: any = {}
  if ( isSuccessfulInitSuggestions ( suggestions ) ) {
    if ( suggestions.packageJsonDetails.length === 0 ) console.log ( 'could not find package.json, so laoban.json will have errors in it!!' ); else
      dic[ 'projectJson' ] = suggestions.packageJsonDetails[ 0 ].contents
  }

  const laoban = derefence ( `Making laoban.json`, dic, rawLaoban, { variableDefn: dollarsBracesVarDefn } );
  return laoban;
}
function removeFrom ( beingCreated: any, template: any ) {
  if ( template === undefined ) return
  Object.keys ( template ).forEach ( key => delete beingCreated[ key ] );
}
async function findTemplatePackageJson ( fileOps: FileOps, initFileContents: InitFileContents, template: string ) {
  const laobanJson = parseJson<any> ( 'laoban json' ) ( initFileContents[ "laoban.json" ] );
  const templates = safeObject<string> ( laobanJson.templates )
  const templateUrl: string = templates[ template ];
  if ( templateUrl === undefined ) return {}
  const templatePackageJson = await fileOps.loadFileOrUrl ( templateUrl )
  return parseJson<any> ( `template package.json for ${template} from ${templateUrl}` ) ( templatePackageJson );
}
export function makeProjectDetails ( templatePackageJson: any, initFileContents: InitFileContents, packageJsonDetails: LocationAnd<any>, allProjectNames: string[] ): string {
  const originalPackageJson = packageJsonDetails.contents;
  const deps = { ...originalPackageJson.dependencies } || {}
  const devDeps = originalPackageJson.devDependencies || {};
  const bins = originalPackageJson.bin || {}
  const links = Object.keys ( deps ).filter ( name => allProjectNames.indexOf ( name ) !== -1 );
  removeFrom ( deps, templatePackageJson.dependencies )
  removeFrom ( devDeps, templatePackageJson.devDependencies )
  links.forEach ( name => delete deps[ name ] );
  // console.log ( 'project.details.json', packageJsonDetails.directory, 'deps', deps, 'devDeps', devDeps, 'bins', bins, 'links', links )

  let projectDetails = initFileContents[ "project.details.json" ];
  const contents = projectDetails.contents
  const details = contents.details || []
  details[ "links" ] = links;
  details[ "extraDeps" ] = deps;
  details[ "extraDevDeps" ] = devDeps;
  details[ "extraBins" ] = bins;
  contents[ "details" ] = details;
  const projectDetailsString = JSON.stringify ( projectDetails, null, 2 )
  const directory = packageJsonDetails.directory;
  const dic: any = {}
  dic [ 'projectJson' ] = packageJsonDetails.contents
  return derefence ( `Making project.details.json for ${directory}`, dic, projectDetailsString, { variableDefn: dollarsBracesVarDefn } );
}
export function findAllProjectNames ( packageJsonDetails: LocationAnd<any>[] ): string[] {
  return packageJsonDetails.map ( p => p.contents.name )
}
export const makeAllProjectDetails = ( templateLookup: NameAnd<any>, initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails, packageJsonDetails: LocationAnd<any>[] ): LocationAnd<string>[] => {
  const allProjectNames = findAllProjectNames ( packageJsonDetails );
  return packageJsonDetails.map ( p => {
    const template = initFileContents.projectDetails.template
    const templatePackageJson = templateLookup[ template ] || {}
    return ({
      location: `${path.join ( p.directory, 'project.details.json' )}`, directory: p.directory,
      contents: makeProjectDetails ( templatePackageJson, initFileContents, p, allProjectNames )
    });
  } );
};

async function findTemplatePackageJsonLookup ( fileOps: FileOps, init: initFileContentsWithParsedLaobanJsonAndProjectDetails, parsedLaoBan: any ): Promise<NameAnd<any>> {
  const template = init.projectDetails.template
  const templateLookup = parsedLaoBan.templates
  let templateUrl = templateLookup[ template ];
  const templatePackageJson = await fileOps.loadFileOrUrl ( path.join ( templateUrl, 'package.json' ) )
  const templateContents = await includeAndTransformFile ( ``, { projectDetails: init.projectDetails }, fileOps ) ( '${}', templatePackageJson ) // we are only have the dependancies, so we don't need to do anything about the variables, but we do need the inclues

  const result: any = {}
  result[ template ] = parseJson ( `Finding template package json for template ${template} at ${templateUrl}` ) ( templateContents )
  return result
}
export async function init ( fileOps: FileOps, directory: string, cmd: any ) {
  const dryRun = cmd.dryrun;

  const suggestions: InitSuggestions = await suggestInit ( fileOps, directory )
  const initFileContents: InitFileContents = await findInitFileContents ( fileOps, cmd.initurl, cmd );
  const laoban = await createLaobanJsonContents ( initFileContents, suggestions );
  if ( isSuccessfulInitSuggestions ( suggestions ) ) {
    const parsedLaoBan = parseJson<any> ( 'laoban.json' ) ( laoban );
    const projectDetailsTemplate = initFileContents[ "project.details.json" ].contents || {}
    const initWith: initFileContentsWithParsedLaobanJsonAndProjectDetails = { ...initFileContents, laoban: parsedLaoBan, projectDetails: projectDetailsTemplate }
    let laobanFileName = path.join ( suggestions.laobanJsonLocation, dryRun ? '.laoban.test.json' : 'laoban.json' );
    await fileOps.saveFile ( laobanFileName, laoban )
    const templatePackageJsonLookup = await findTemplatePackageJsonLookup ( fileOps, initWith, parsedLaoBan )
    const projectDetails = makeAllProjectDetails ( templatePackageJsonLookup, initWith, suggestions.packageJsonDetails );
    await Promise.all ( projectDetails.map ( p => {
      const json = parseJson<any> ( `Project details for ${p.directory}` ) ( p.contents )
      const contents = JSON.stringify ( json.contents, null, 2 )
      return fileOps.saveFile ( path.join ( p.directory, dryRun ? '.project.details.test.json' : 'project.details.json' ), contents );
    } ) )
  } else console.log ( 'Could not work out how to create', JSON.stringify ( suggestions, null, 2 ) )
}