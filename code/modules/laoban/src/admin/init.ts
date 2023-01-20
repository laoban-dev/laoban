//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { combineTwoObjects, lastSegment, NameAnd, safeArray, safeObject } from "@laoban/utils";
import { FailedInitSuggestions, InitSuggestions, isSuccessfulInitSuggestions, SuccessfullInitSuggestions, suggestInit } from "./initStatus";
import { derefence, dollarsBracesVarDefn, findVar } from "@laoban/variables";
import { laobanJsonLocations, } from "./fileLocations";
import path from "path";
import { FileOps, findChildFiles, loadWithParents, LocationAnd, LocationAndParsed, parseJson } from "@laoban/fileops";
import { combineRawConfigs } from "../config";
import { findTemplatePackageJsonLookup, PackageDetailsAndLocations } from "../loadingTemplates";
import { findLaobanOrUndefined, loabanConfigTestName, packageDetailsFile, packageDetailsTestFile } from "../Files";
import { ActionParams } from "./types";
import { getInitDataWithoutTemplatesFilteredByPackages, HasPackages } from "./analyze";

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
  type: string
  location: string
  parents?: string | string[]
  markers?: string | string[]
  "laoban.json": any;
  "package.details.json": ProjectDetailsJson
}
export interface initFileContentsWithParsedLaobanJsonAndProjectDetails extends InitFileContents, PackageDetailsAndLocations {
  laoban: any
  packageDetails: any
}
const combineInitContents = ( type: string, summary: ( i: InitFileContents ) => string ) => ( i1: InitFileContents, i2: InitFileContents ): InitFileContents => {
  return {
    "laoban.json": combineRawConfigs ( i1[ "laoban.json" ], i2[ "laoban.json" ] ),
    "package.details.json": combineProjectDetailsJson ( i1[ "package.details.json" ], i2[ "package.details.json" ] ),
    markers: safeArray ( i1.markers ).concat ( safeArray ( i2.markers ) ),
    location: `${i1.location} and ${i2.location}`,
    type
  }
};

export async function findTypes ( fileOps: FileOps, cmd: TypeCmdOptions ) {
  function error ( msg: string | string[] ) {
    safeArray ( msg ).forEach ( m => console.error ( m ) )
    process.exit ( 1 )
  }
  const initUrl = cmd.initurl
  const inits: NameAnd<string> = parseJson<NameAnd<string>> ( `init ${initUrl}` ) ( await fileOps.loadFileOrUrl ( initUrl ) )
  const types = cmd.legaltypes || Object.keys ( inits )
  if ( types.length === 0 ) {
    const why = cmd.type ? `You specified --legaltypes but no actual types` : `No types found at ${initUrl}`
    error ( `No types defined. specified. ${why}` )
  }
  const errors = types.filter ( t => Object.keys ( inits ).indexOf ( t ) === -1 )
  if ( errors.length > 0 ) return Promise.reject ( `The following types are not defined : ${errors.join ( ', ' )}. Legal values are ${JSON.stringify ( Object.keys ( inits ) )}` )
  const type = cmd.type || types[ 0 ];
  if ( !types.includes ( type ) ) error ( `Type [${type}] is not legal. Legal values are ${types.join ( ',' )}` )

  const listTypes = cmd.listTypes
  if ( listTypes ) {
    const msgs: string[] = []
    msgs.push ( `Legal types from ${initUrl} are ${JSON.stringify ( inits, null, 2 )}` )
    if ( cmd.legaltypes ) msgs.push ( `You specified --legaltypes of [${cmd.legaltypes}] so only those types will be used` )
    error ( msgs )
  }
  const typeUrls = types.map ( t => inits[ t ] )
  return { type, inits, typeUrls }
}

interface TypeAndIFC {
  allInitFileContents: InitFileContents[]
  type: string
}
export async function findInitFileContents ( fileOps: FileOps, cmd: TypeCmdOptions ): Promise<TypeAndIFC> {
  const { type, typeUrls, inits } = await findTypes ( fileOps, cmd )
  const loadInits = loadWithParents<InitFileContents> ( ``,
    url => fileOps.loadFileOrUrl ( url + '/.init.json' ),
    context => ( s, url ) => ({ ...parseJson<InitFileContents> ( context ) ( s ), location: url, type }),
    init => safeArray ( init.parents ),
    combineInitContents ( type, i => `Parents ${i.parents}` ) )

  return { type, allInitFileContents: await Promise.all <InitFileContents> ( typeUrls.map ( loadInits ) ) }
}

async function createLaobanJsonContents ( initFileContents: InitFileContents, suggestions: InitSuggestions, quiet: boolean ): Promise<string> {
  let rawLaoban = JSON.stringify ( initFileContents[ "laoban.json" ], null, 2 );
  const dic: any = {}
  if ( isSuccessfulInitSuggestions ( suggestions ) ) {
    if ( suggestions.packageJsonDetails.length === 0 ) {
      if ( !quiet ) console.log ( 'could not find package.json, so laoban.json will have errors in it!!' );
    } else
      dic[ 'packageJson' ] = suggestions.packageJsonDetails[ 0 ].contents
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
  const keywords = originalPackageJson.keywords || [];
  const bins = originalPackageJson.bin || {}
  const links = Object.keys ( deps ).filter ( name => allProjectNames.indexOf ( name ) !== -1 );
  removeFrom ( deps, templatePackageJson.dependencies )
  removeFrom ( devDeps, templatePackageJson.devDependencies )
  links.forEach ( name => delete deps[ name ] );
  // console.log ( 'package.details.expected.json', packageJsonDetails.directory, 'deps', deps, 'devDeps', devDeps, 'bins', bins, 'links', links )

  let projectDetails = initFileContents[ "package.details.json" ];
  const contents = projectDetails.contents
  const details = contents.details || []
  details[ "links" ] = links;
  details[ "extraDeps" ] = deps;
  details[ "extraDevDeps" ] = devDeps;
  details[ "extraBins" ] = bins;
  details[ "keywords" ] = keywords;
  contents[ "details" ] = details;
  const projectDetailsString = JSON.stringify ( projectDetails, null, 2 )
  const directory = packageJsonDetails.directory;
  const dic: any = {}
  dic [ 'packageJson' ] = packageJsonDetails.contents
  return derefence ( `Making ${packageDetailsFile} for ${directory}`, dic, projectDetailsString, { variableDefn: dollarsBracesVarDefn } );
}
export function findAllProjectNames ( packageJsonDetails: LocationAnd<any>[] ): string[] {
  return packageJsonDetails.map ( p => p.contents.name )
}
export interface ProjectDetailsAndTemplate extends LocationAnd<string> {
  template: string
  templatePackageJson: any
}
function findRequestedIFCForLaoban<F extends InitFileContents> ( initFileContents: F[], type: string ): F {
  if ( !initFileContents || safeArray ( initFileContents ).length === 0 ) throw new Error ( `Init file contents are: ${initFileContents}` )
  let result = initFileContents.find ( ifc => ifc.type === type );
  if ( result === undefined ) throw new Error ( `Could not find type ${type} in ${JSON.stringify ( initFileContents.map ( ifc => ifc.type ) )}` )
  return result
}
function findAppropriateIfc ( initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails[], type: string, packageJson: LocationAndParsed<any> ) {
  // console.log(initFileContents.map(i => i.location))
  const evaluateMarker = ( m: string ) => {
    if ( !m.startsWith ( 'json:' ) ) throw Error ( `Illegal marker ${m}. Must start with json:` )
    let markerWithoutPrefix = m.substring ( 5 );
    let dic = { packageJson: packageJson.contents };
    let result = findVar ( dic, markerWithoutPrefix );
    return result;
  };
  const found = initFileContents.find ( ( ifc, i ) => {
    const markers = safeArray ( ifc.markers )
    const valid = markers.reduce ( ( acc, m ) => evaluateMarker ( m ) && acc, true )
    return valid
  } )
  let result = found || findRequestedIFCForLaoban ( initFileContents, type );
  return result;
}
export const makeAllProjectDetails = ( templateLookup: NameAnd<any>, initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails[], type: string, packageJsonDetails: LocationAndParsed<any>[] ): ProjectDetailsAndTemplate[] => {
  const allProjectNames = findAllProjectNames ( packageJsonDetails );
  return packageJsonDetails.map ( p => {
    let theBestIfc = findAppropriateIfc ( initFileContents, type, p );
    const template = theBestIfc.packageDetails.template
    const templatePackageJson = templateLookup[ template ] || {}
    return ({
      location: `${path.join ( p.directory, packageDetailsFile )}`, directory: p.directory,
      contents: makeProjectDetails ( templatePackageJson, theBestIfc, p, allProjectNames ),
      template, templatePackageJson
    });
  } );
};

async function loadSingleFileFromTemplate ( fileOps: FileOps, templateUrl: string, fileName: string ) {

}


export interface SuccessfullInitData {
  existingLaobanFile: string,
  suggestions: SuccessfullInitSuggestions
  initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails[]
  laoban: string
  parsedLaoBan: any
  projectDetails: ProjectDetailsAndTemplate[]
}
interface FailedInitData {
  suggestions: FailedInitSuggestions
  initFileContents: InitFileContents[]
}
export type InitData = SuccessfullInitData | FailedInitData
export function isSuccessfulInitData ( data: InitData ): data is SuccessfullInitData {
  return isSuccessfulInitSuggestions ( data.suggestions )
}


export async function findLaobanUpOrDown ( fileOps: FileOps, directory: string ): Promise<string> {
  const goingUp = findLaobanOrUndefined ( directory )
  if ( goingUp !== undefined ) return Promise.resolve ( goingUp )
  let jsonLocations = await laobanJsonLocations ( fileOps, directory );
  return jsonLocations.map ( l => path.join ( directory, l ) )?.[ 0 ]
}
function findInitFileContentsFor ( initFileContents: InitFileContents[], parsedLaoBan: any ): initFileContentsWithParsedLaobanJsonAndProjectDetails[] {
  return initFileContents.map ( oneIFC => {
    const projectDetailsTemplate = oneIFC[ "package.details.json" ].contents || {}
    const initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails = { ...oneIFC, laoban: parsedLaoBan, packageDetails: projectDetailsTemplate }
    return initFileContents;
  } )
}
export async function gatherInitData ( fileOps: FileOps, directory: string, cmd: TypeCmdOptions, quiet: boolean ): Promise<InitData> {
  const { type, allInitFileContents } = await findInitFileContents ( fileOps, cmd );
  const existingLaobanFile = await findLaobanUpOrDown ( fileOps, directory )
  const suggestions: InitSuggestions = await suggestInit ( fileOps, directory, existingLaobanFile )
  const firstInitFileContents = findRequestedIFCForLaoban ( allInitFileContents, type )
  const laoban = await createLaobanJsonContents ( firstInitFileContents, suggestions, quiet );
  if ( isSuccessfulInitSuggestions ( suggestions ) ) {
    const parsedLaoBan = parseJson<any> ( 'laoban.json' ) ( laoban );
    const initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails[] = findInitFileContentsFor ( allInitFileContents, parsedLaoBan );
    const templatePackageJsonLookup = await findTemplatePackageJsonLookup ( fileOps, initFileContents, parsedLaoBan )
    const projectDetails: ProjectDetailsAndTemplate[] = makeAllProjectDetails ( templatePackageJsonLookup, initFileContents, type, suggestions.packageJsonDetails );
    return { existingLaobanFile, suggestions, parsedLaoBan, initFileContents, laoban, projectDetails }
  } else
    return { suggestions, initFileContents: allInitFileContents }
}
const laobanIgnores = `

# Laoban ignores
.cache/
.session/
.log
.status
.profile
.version.test.txt
.package.details.test.json
.laoban.test.json
`;
interface LocationAndUpdate extends LocationAnd<string> {
  update: boolean
}
function isLocationAndUpdate ( l: LocationAnd<string> | LocationAndUpdate ): l is LocationAndUpdate {
  return (l as LocationAndUpdate).update !== undefined
}

export async function updateIgnore ( fileOps: FileOps, init: SuccessfullInitSuggestions ): Promise<LocationAndUpdate[]> {
  if ( init.gitRepo !== undefined ) {
    const filename = fileOps.join ( init.gitRepo, '.gitignore' );
    if ( await fileOps.isFile ( filename ) ) {
      const existing = await fileOps.loadFileOrUrl ( filename )
      const included = existing.includes ( '# Laoban ignores' );
      return included ? [] : [ {
        location: filename,
        directory: init.gitRepo,
        contents: existing.trimRight () + laobanIgnores, update: true
      } ];
    } else return [ {
      location: filename,
      directory: init.gitRepo,
      contents: laobanIgnores.trimLeft (),
      update: false
    } ]
  }
  return []

}
export async function filesAndContents ( fileOps: FileOps, initData: SuccessfullInitData, dryRun: boolean ): Promise<LocationAnd<string>[]> {
  let laobanFileName = path.join ( initData.suggestions.laobanJsonLocation, dryRun ? loabanConfigTestName : 'laoban.json' );
  const laoban: LocationAnd<any> = { location: laobanFileName, contents: initData.laoban, directory: initData.suggestions.laobanJsonLocation }
  const projectDetails: LocationAnd<any>[] = initData.projectDetails.map ( p => {
    const json = parseJson<any> ( () => `Project details for ${p.directory}` ) ( p.contents )
    const contents = JSON.stringify ( json.contents, null, 2 )
    return { directory: p.directory, location: path.join ( p.directory, dryRun ? packageDetailsTestFile : packageDetailsFile ), contents }
  } );
  const version: LocationAnd<any> = {
    location: path.join ( initData.suggestions.laobanJsonLocation, dryRun ? '.version.test.txt' : 'version.txt' ),
    contents: initData.suggestions.version || '0.0.0',
    directory: initData.suggestions.laobanJsonLocation
  }
  const gitIgnores = dryRun ? [] : await updateIgnore ( fileOps, initData.suggestions );
  return [ laoban, ...projectDetails, version, ...gitIgnores ]
}
async function saveInitDataToFiles ( fileOps: FileOps, data: LocationAnd<string> [], cmd: InitCmdOptions ): Promise<void> {
  await Promise.all ( data.map ( async ( l ) => {
    const { location, contents } = l
    if ( cmd.dryrun || cmd.force || !await fileOps.isFile ( location ) ) {
      console.log ( 'Creating file: ', location );
      return fileOps.saveFile ( location, contents );
    } else if ( !cmd.dryrun && isLocationAndUpdate ( l ) && l.update ) {
      console.log ( 'Updating file: ', location );
      return fileOps.saveFile ( location, contents );
    }
    console.log ( `Skipping ${location} because it already exists (use --force to create it)` )
  } ) )
}

export function reportInitData ( initData: SuccessfullInitData, files: LocationAnd<string>[] ): void {
  initData.suggestions.comments.forEach ( c => console.log ( c ) )
}
export interface TypeCmdOptions {
  type: string
  legaltypes: string[]
  initurl: string
  listTypes?: boolean
  cleantestfiles?
  boolean
}
interface InitCmdOptions extends TypeCmdOptions, HasPackages {
  dryrun?: boolean
  force?: boolean
}
export async function init ( { fileOps, cmd, currentDirectory }: ActionParams<InitCmdOptions> ): Promise<void> {
  const clearDirectory = path.join ( currentDirectory ).replace ( /\\/g, '/' )
  if ( cmd.dryrun && cmd.force ) {
    console.log ( 'Cannot have --dryrun and --force' )
    return
  }
  if ( cmd.cleantestfiles ) {
    const files = await findChildFiles ( fileOps,
      s => s === 'node_modules' || s === '.git' || s === '.session' ) ( currentDirectory )
    const relevantFiles = files.filter ( l => {
      const f = lastSegment ( l )
      return f === '.version.test.txt' || f == '.package.details.test.json' || f === '.laoban.test.json';
    } )
    for ( const f of relevantFiles ) {
      console.log ('deleting',f)
      await fileOps.removeFile ( f )
    }
    return
  }
  const dryRun = cmd.dryrun;
  const rawInitData = await gatherInitData ( fileOps, clearDirectory, cmd, false )
  if ( isSuccessfulInitData ( rawInitData ) ) {
    const initData = await getInitDataWithoutTemplatesFilteredByPackages ( fileOps, rawInitData, cmd )
    const files: LocationAnd<string>[] = await filesAndContents ( fileOps, initData, dryRun )
    reportInitData ( initData, files )
    console.log ()
    await saveInitDataToFiles ( fileOps, files, cmd );
    if ( cmd.dryrun ) {
      console.log ()
      console.log ( `The files created above are for you to examine and 'see what would happen` )
      console.log ( `They can be cleaned by running 'laoban init --cleantestfiles'` )
    }
  } else
    console.log ( 'Could not work out how to create', JSON.stringify ( rawInitData.suggestions, null, 2 ) )
}
