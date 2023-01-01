import { FileOps, NameAnd, parseJson, safeObject } from "@phil-rice/utils";
import { findInitFileContents, InitFileContents, initFileContentsWithParsedLaobanJsonAndProjectDetails } from "laoban/dist/src/init";
import { InitSuggestions, isSuccessfulInitSuggestions, suggestInit } from "./status";
import { derefence, dollarsBracesVarDefn } from "@phil-rice/variables";
import { LocationAnd } from "./fileLocations";
import path from "path";
import { includeAndTransformFile } from "laoban/dist/src/update";


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