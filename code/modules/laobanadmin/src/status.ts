import { chain, FileOps, findHighestVersion, isLocationAndErrors, isLocationAndParsed, LocationAndErrors, LocationAndParsed, LocationAndParsedOrErrors, unique } from "@laoban/utils";
import { gitLocation, gitLocationsUnderHere, packageJsonAndLocations, packageJsonHasWorkspaces, packageJsonLocations, packageJsonLocationsUnder } from "./fileLocations";
import path from "path";
import { findLaobanOrUndefined } from "laoban/dist/src/Files";

export async function reportOnGit ( fileOps: FileOps, directory: string, gitRepo: string ): Promise<void> {

  if ( gitRepo ) {
    if ( gitRepo === directory ) {
      console.log ( `Current directory ${directory} is a git repo` )
      return Promise.resolve ()
    } else {
      console.log ( `Current directory ${directory} is in a git repo at ${gitRepo}` )
      return Promise.resolve ()
    }
  }
  const gits = await gitLocationsUnderHere ( fileOps, directory )
  if ( gits.length > 0 ) {
    console.log ( 'Gits under here' )
    gits.forEach ( g => console.log ( g ) )
    return Promise.resolve ()
  }
  return Promise.reject ( 'No git found' )
}

interface PackageJsonDetails {
  withWorkspaces: LocationAndParsed<any>[]
  withoutWorkspaces: LocationAndParsed<any>[]
  withErrors: LocationAndErrors[]

}

function partitionPackageJsons ( packageJsons: LocationAndParsedOrErrors<any>[] ): PackageJsonDetails {
  const withWorkspaces: LocationAndParsed<any>[] = []
  const withoutWorkspaces: LocationAndParsed<any>[] = []
  const withErrors: LocationAndErrors[] = []
  packageJsons.forEach ( p => {
    if ( isLocationAndParsed ( p ) )
      if ( packageJsonHasWorkspaces ( p.contents ) )
        withWorkspaces.push ( p )
      else {
        withoutWorkspaces.push ( p )
      }
    else if ( isLocationAndErrors ( p ) )
      withErrors.push ( p )
    else throw new Error ( `Unexpected type ${p}` )
  } )
  return { withWorkspaces, withoutWorkspaces, withErrors }
}
function combinePackageJsons ( p1: PackageJsonDetails, p2: PackageJsonDetails ): PackageJsonDetails {
  return {
    withWorkspaces: unique ( p1.withWorkspaces.concat ( p2.withWorkspaces ), s => s.location ),
    withoutWorkspaces: unique ( p1.withoutWorkspaces.concat ( p2.withoutWorkspaces ), s => s.location ),
    withErrors: p1.withErrors.concat ( p2.withErrors )
  }
}

export async function findPackageJsonDetails ( fileOps: FileOps, directory: string ): Promise<PackageJsonDetails> {
  const firstLocations: string[] = await packageJsonLocations ( fileOps, directory )
  const firstDetails = partitionPackageJsons ( await packageJsonAndLocations ( 'Finding Package.jsons', fileOps, firstLocations ) )
  if ( firstDetails.withWorkspaces.length === 0 ) return firstDetails
  const secondLocationsDir = firstDetails.withWorkspaces.map ( ( { directory } ) => directory )
  const secondLocationsRaw: string[][] = await Promise.all <string[]> ( secondLocationsDir.map ( directory => packageJsonLocationsUnder ( fileOps, directory ) ) )
  let secondLocations: string[] = []
  secondLocationsRaw.forEach ( s => secondLocations = secondLocations.concat ( s ) )
  const secondDetails = partitionPackageJsons ( await packageJsonAndLocations ( 'Finding Package.jsons under workspaces', fileOps, secondLocations ) )
  return combinePackageJsons ( firstDetails, secondDetails )
}

export interface SuccessfullInitSuggestions {
  version: string
  comments: string[]
  laobanJsonLocation: string
  packageJsonDetails: LocationAndParsed<any>[]
}
export function isSuccessfulInitSuggestions ( suggestions: InitSuggestions ): suggestions is SuccessfullInitSuggestions {
  const a: any = suggestions;
  return a.laobanJsonLocation !== undefined
}
export interface FailedInitSuggestions {
  comments: string[]
}
export type InitSuggestions = SuccessfullInitSuggestions | FailedInitSuggestions

interface PackageJsonDetailsAndGitRepo {
  directory: string
  existingLaobanFile: string | undefined
  details: PackageJsonDetails
  gitRepo: string | undefined
}
function suggestFromExistingLaobanJson ( { existingLaobanFile, details, directory }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  if ( existingLaobanFile !== undefined ) {
    return {
      comments: [ `Found an existing laoban.json file at ${existingLaobanFile}` ],
      laobanJsonLocation: existingLaobanFile,
      packageJsonDetails: withoutWorkspacesUnderLaobanJson ( details, existingLaobanFile )
    }
  }
}
function suggestFromGitRepo ( { gitRepo, details }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  if ( gitRepo !== undefined ) return {
    laobanJsonLocation: gitRepo,
    packageJsonDetails: withoutWorkspacesUnderLaobanJson ( details, gitRepo ),
    comments: [ `Found a git repo. This is usually a good place for the laoban.json file` ]
  }
}
function withoutWorkspacesUnderLaobanJson ( details: PackageJsonDetails, laobanJsonLocation: string ) {
  let searchString = path.join ( laobanJsonLocation );
  return details.withoutWorkspaces.filter ( s => s.location.startsWith ( searchString ) )
}
function suggestFromSingleWorkspaceJson ( { details }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  if ( details.withWorkspaces.length === 1 ) {
    const notIn = details.withoutWorkspaces
    let laobanJsonLocation = path.join ( details.withWorkspaces[ 0 ].directory );
    const packageDetailsJsonLocation = withoutWorkspacesUnderLaobanJson ( details, laobanJsonLocation )
    const spareWorkspaces = details.withoutWorkspaces.filter ( s => !s.location.startsWith ( laobanJsonLocation ) )
    return {
      laobanJsonLocation,
      packageJsonDetails: packageDetailsJsonLocation,
      comments: [ `Found a single package.json with workspaces. This is usually a good place for the laoban.json file`,
        ...spareWorkspaces.map ( s => `Workspace ${s.location} is not 'covered' by the laoban.json file` )
      ]
    }
  }
}
function noWorkspaces ( { details: details, directory }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  if ( details.withWorkspaces.length === 0 ) return {
    comments: [ 'There is no git repo or package.json with workspaces, so the current directory is suggested' ],
    laobanJsonLocation: directory,
    packageJsonDetails: withoutWorkspacesUnderLaobanJson ( details, directory )
  }
}
function noIdeaWhatToDo ( { details, directory }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  return {
    comments: [ `Resorting to default: suggesting the current directory  ` ],
    laobanJsonLocation: directory,
    packageJsonDetails: withoutWorkspacesUnderLaobanJson ( details, directory )
  }
}
export const suggestInitSuggestions = chain ( suggestFromExistingLaobanJson, suggestFromSingleWorkspaceJson, suggestFromGitRepo, noWorkspaces, noIdeaWhatToDo )

export async function reportOnPackageJson ( params: PackageJsonDetailsAndGitRepo ): Promise<void> {
  const { details } = params
  console.log ( 'Package.json details' )
  console.log ( 'With workspace', details.withWorkspaces.map ( ( { location } ) => location ) )
  console.log ( 'Without workspace', details.withoutWorkspaces.map ( ( { location } ) => location ) )
  console.log ( 'With errors', details.withErrors.map ( ( { location } ) => location ) )
  console.log ( ' -- ' )
}

export async function suggestInit ( fileOps: FileOps, directory: string, existingLaobanFile: string ): Promise<InitSuggestions> {
  const gitRepo = await gitLocation ( fileOps, directory );
  const packageJsonDetails = await findPackageJsonDetails ( fileOps, directory )
  let params = { gitRepo, details: packageJsonDetails, directory, existingLaobanFile };
  let version = findHighestVersion ( packageJsonDetails.withoutWorkspaces.map ( p => p.contents.version ) );
  console.log ( 'highestVersion', version )
  return { version, ...suggestInitSuggestions ( params ) }
}
export async function status ( fileOps: FileOps, directory: string ) {
  const existingLaobanFile = findLaobanOrUndefined ( directory )
  const suggestions = await suggestInit ( fileOps, directory, existingLaobanFile )
  console.log ( 'suggestions', suggestions )
}