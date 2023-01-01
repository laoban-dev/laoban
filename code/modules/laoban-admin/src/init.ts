import { FileOps, parseJson } from "@phil-rice/utils";
import { findInitFileContents, InitFileContents } from "laoban/dist/src/init";
import { InitSuggestions, isSuccessfulInitSuggestions, suggestInit } from "./status";
import { derefence, dollarsBracesVarDefn } from "@phil-rice/variables";
import { LocationAnd } from "./fileLocations";
import path from "path";


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
export function makeProjectDetails ( initFileContents: InitFileContents, packageJsonDetails: LocationAnd<any>, allProjectNames: string[] ): string {
  const originalPackageJson = packageJsonDetails.contents;
  const deps = { ...originalPackageJson.dependencies } || {}
  const devDeps = originalPackageJson.devDependencies || {};
  const bins = originalPackageJson.bin || {}
  const links = Object.keys ( deps ).filter ( name => allProjectNames.indexOf ( name ) !== -1 );
  links.forEach ( name => delete deps[ name ] );
  console.log ( 'project.details.json', packageJsonDetails.directory, 'deps', deps, 'devDeps', devDeps, 'bins', bins, 'links', links )

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
export const makeAllProjectDetails = ( initFileContents: InitFileContents, packageJsonDetails: LocationAnd<any>[] ): LocationAnd<string>[] => {
  const allProjectNames = findAllProjectNames ( packageJsonDetails );
  return packageJsonDetails.map ( p => ({
    location: `${path.join ( p.directory, 'project.details.json' )}`, directory: p.directory,
    contents: makeProjectDetails ( initFileContents, p, allProjectNames )
  }) );
};

export async function init ( fileOps: FileOps, directory: string, cmd: any ) {
  const suggestions: InitSuggestions = await suggestInit ( fileOps, directory )
  const initFileContents: InitFileContents = await findInitFileContents ( fileOps, cmd.initurl, cmd );
  const laoban = await createLaobanJsonContents ( initFileContents, suggestions );
  console.log ( 'laoban.json', laoban )
  console.log ( '----' )
  if ( isSuccessfulInitSuggestions ( suggestions ) ) {
    console.log ( 'laobanFileName', suggestions.laobanJsonLocation )
    let laobanFileName = path.join ( suggestions.laobanJsonLocation, '.laoban.test.json' );
    console.log ( 'laobanFileName', laobanFileName )
    await fileOps.saveFile ( laobanFileName, laoban )
    const projectDetails = makeAllProjectDetails ( initFileContents, suggestions.packageJsonDetails );
    // console.log ( 'project.details.json', projectDetails )
    await Promise.all ( projectDetails.map ( p => {
      const json = parseJson<any> ( `Project details for ${p.directory}` ) ( p.contents )
      const contents = JSON.stringify ( json.contents, null, 2 )
      return fileOps.saveFile ( path.join ( p.directory, '.project.details.test.json' ), contents );
    } ) )
  } else console.log ( 'Could not work out how to create', JSON.stringify ( suggestions, null, 2 ) )
}