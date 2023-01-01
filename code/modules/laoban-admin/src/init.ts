import { combineTwoObjects, FileOps, loadWithParents, NameAnd, parseJson, safeArray, safeObject } from "@phil-rice/utils";
import { FailedInitSuggestions, InitSuggestions, isSuccessfulInitSuggestions, SuccessfullInitSuggestions, suggestInit } from "./status";
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


export async function findInitFileContents ( fileOps: FileOps, initUrl: string, cmd: InitCmdOptions ): Promise<InitFileContents> {
  const types = cmd.types
  const listTypes = cmd.listTypes
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

interface SuccessfullInitData {
  suggestions: SuccessfullInitSuggestions
  initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails
  laoban: string
  parsedLaoBan: any
  projectDetails: LocationAnd<string>[]
}
interface FailedInitData {
  suggestions: FailedInitSuggestions
  initFileContents: InitFileContents
}
type InitData = SuccessfullInitData | FailedInitData
function isSuccessfulInitData ( data: InitData ): data is SuccessfullInitData {
  return isSuccessfulInitSuggestions ( data.suggestions )
}

export async function gatherInitData ( fileOps: FileOps, directory: string, cmd: InitCmdOptions ): Promise<InitData> {
  const suggestions: InitSuggestions = await suggestInit ( fileOps, directory )
  const rawInitFileContents: InitFileContents = await findInitFileContents ( fileOps, cmd.initurl, cmd );
  const laoban = await createLaobanJsonContents ( rawInitFileContents, suggestions );
  if ( isSuccessfulInitSuggestions ( suggestions ) ) {
    const parsedLaoBan = parseJson<any> ( 'laoban.json' ) ( laoban );
    const projectDetailsTemplate = rawInitFileContents[ "project.details.json" ].contents || {}
    const initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails = { ...rawInitFileContents, laoban: parsedLaoBan, projectDetails: projectDetailsTemplate }
    const templatePackageJsonLookup = await findTemplatePackageJsonLookup ( fileOps, initFileContents, parsedLaoBan )
    const projectDetails: LocationAnd<string>[] = makeAllProjectDetails ( templatePackageJsonLookup, initFileContents, suggestions.packageJsonDetails );
    return { suggestions, parsedLaoBan, initFileContents, laoban, projectDetails }
  } else
    return { suggestions, initFileContents: rawInitFileContents }
}

export function filesAndContents ( initData: SuccessfullInitData, dryRun: boolean ): LocationAnd<string>[] {
  let laobanFileName = path.join ( initData.suggestions.laobanJsonLocation, dryRun ? '.laoban.test.json' : 'laoban.json' );
  const laoban: LocationAnd<any> = { location: laobanFileName, contents: initData.laoban, directory: initData.suggestions.laobanJsonLocation }
  const projectDetails: LocationAnd<any>[] = initData.projectDetails.map ( p => {
    const json = parseJson<any> ( `Project details for ${p.directory}` ) ( p.contents )
    const contents = JSON.stringify ( json.contents, null, 2 )
    return { directory: p.directory, location: path.join ( p.directory, dryRun ? '.project.details.test.json' : 'project.details.json' ), contents }
  } );
  return [ laoban, ...projectDetails ]
}
async function saveInitDataToFiles ( fileOps: FileOps, data: LocationAnd<string> [] ): Promise<void> {
  await Promise.all ( data.map ( async ( { location, contents } ) => fileOps.saveFile ( location, contents ) ) )
}

export function reportInitData ( initData: SuccessfullInitData, files: LocationAnd<string>[] ): void {
  initData.suggestions.comments.forEach ( c => console.log ( c ) )
}
interface InitCmdOptions {
  dryrun: boolean
  types: string[]
  listTypes: boolean
  initurl: string
  force: boolean
}
export async function init ( fileOps: FileOps, directory: string, cmd: InitCmdOptions ) {
  if ( cmd.dryrun && cmd.force ) {
    console.log ( 'Cannot have --dryrun and --force' )
    return
  }
  if ( cmd.listTypes ) {
    const init = await fileOps.loadFileOrUrl ( cmd.initurl )
    console.log ( init )
    return
  }
  const dryRun = cmd.dryrun;
  const initData = await gatherInitData ( fileOps, directory, cmd )
  if ( isSuccessfulInitData ( initData ) ) {
    const files: LocationAnd<string>[] = filesAndContents ( initData, dryRun )
    if ( cmd.force || cmd.dryrun ) await saveInitDataToFiles ( fileOps, files );
    if ( cmd.dryrun ) {
      console.log ()
      reportInitData ( initData, files )
      console.log ()
      files.forEach ( f => console.log ( `Created ${f.location}` ) )
      console.log()
      console.log ( 'Dry run complete' )
      console.log()
      console.log ( 'This created files .loaban.test.json and .project.details.test.json in the project directories' )
      console.log ( 'To create the actual files use --force' )
    } else if ( cmd.force ) {
      reportInitData ( initData, files )
      files.forEach ( f => console.log ( `Created ${f.location}` ) )
    } else {
      console.log ( 'Would create files' )
      console.log ( '==================' )
      files.forEach ( f => {
        console.log
        console.log ( f.location );
        console.log ( ''.padStart ( f.location.length, '-' ) );
        console.log ( f.contents );
      } )
      reportInitData ( initData, files )
      console.log ()
      console.log ( 'To actually create the files use --force. To see them "in situ" before creating them use --dryrun' )

    }

  } else
    console.log ( 'Could not work out how to create', JSON.stringify ( initData.suggestions, null, 2 ) )
}
