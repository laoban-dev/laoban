import { chain, FileOps, unique } from "@phil-rice/utils";
import { gitLocation, gitLocationsUnderHere, isLocationAnd, LocationAnd, LocationAndContents, LocationAndErrors, packageJsonAndLocations, packageJsonHasWorkspaces, packageJsonLocations, packageJsonLocationsUnder } from "./fileLocations";
import path from "path";

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
  withWorkspaces: LocationAnd<any>[]
  withoutWorkspaces: LocationAnd<any>[]
  withErrors: LocationAndErrors[]

}

function partitionPackageJsons ( packageJsons: LocationAndContents<any>[] ): PackageJsonDetails {
  const withWorkspaces: LocationAnd<any>[] = []
  const withoutWorkspaces: LocationAnd<any>[] = []
  const withErrors: LocationAndErrors[] = []
  packageJsons.forEach ( p => {
    if ( isLocationAnd ( p ) ) {
      if ( packageJsonHasWorkspaces ( p.contents ) ) {
        withWorkspaces.push ( p )
      } else {
        withoutWorkspaces.push ( p )
      }
    } else {
      withErrors.push ( p )
    }
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
  const firstLocations = await packageJsonLocations ( fileOps, directory )
  const firstDetails = partitionPackageJsons ( await packageJsonAndLocations ( 'Finding Package.jsons', fileOps, firstLocations ) )
  if ( firstDetails.withWorkspaces.length === 0 ) return firstDetails
  const secondLocationsDir = firstDetails.withWorkspaces.map ( ( { directory } ) => directory )
  const secondLocations: string[] = (await Promise.all <string[]> ( secondLocationsDir.map ( directory => packageJsonLocationsUnder ( fileOps, directory ) ) )).flat ()
  console.log ( 'secondLocation dirs', secondLocationsDir )
  console.log ( 'secondLocations', secondLocations )
  const secondDetails = partitionPackageJsons ( await packageJsonAndLocations ( 'Finding Package.jsons under workspaces', fileOps, secondLocations ) )
  // console.log('firstDetails', firstDetails)
  // console.log('secondDetails', secondDetails)
  let result = combinePackageJsons ( firstDetails, secondDetails );
  // console.log('result', result)
  return result
}

export interface SuccessfullInitSuggestions {
  comments: string[]
  laobanJsonLocation: string
  packageJsonDetails: LocationAnd<any>[]
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
  details: PackageJsonDetails
  gitRepo: string | undefined
}
function suggestFromGitRepo ( { gitRepo, details }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  if ( gitRepo !== undefined ) return {
    laobanJsonLocation: gitRepo,
    packageJsonDetails: details.withoutWorkspaces,
    comments: [ `Found a git repo. This is usually a good place for the laoban.json file` ]
  }
}
function suggestFromSingleWorkspaceJson ( { details }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  if ( details.withWorkspaces.length === 1 ) {
    const notIn = details.withoutWorkspaces
    let laobanJsonLocation = path.join ( details.withWorkspaces[ 0 ].directory );
    const packageDetailsJsonLocation = details.withoutWorkspaces.filter ( s => s.location.startsWith ( laobanJsonLocation ) )
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
    packageJsonDetails: details.withoutWorkspaces
  }
}
function noIdeaWhatToDo ( { details, directory }: PackageJsonDetailsAndGitRepo ): InitSuggestions | undefined {
  return {
    comments: [ `Resorting to default: suggesting the current directory  ` ],
    laobanJsonLocation: directory,
    packageJsonDetails: details.withoutWorkspaces
  }
}
export const suggestInitSuggestions = chain ( suggestFromSingleWorkspaceJson, suggestFromGitRepo, noWorkspaces, noIdeaWhatToDo )

export async function reportOnPackageJson ( params: PackageJsonDetailsAndGitRepo ): Promise<void> {
  const { details } = params
  console.log ( 'Package.json details' )
  console.log ( 'With workspace', details.withWorkspaces.map ( ( { location } ) => location ) )
  console.log ( 'Without workspace', details.withoutWorkspaces.map ( ( { location } ) => location ) )
  console.log ( 'With errors', details.withErrors.map ( ( { location } ) => location ) )
  console.log ( ' -- ' )
}

export async function suggestInit ( fileOps: FileOps, directory: string ): Promise<InitSuggestions> {
  const gitRepo = await gitLocation ( fileOps, directory );
  const packageJsonDetails = await findPackageJsonDetails ( fileOps, directory )
  let params = { gitRepo, details: packageJsonDetails, directory };
  return suggestInitSuggestions ( params )
}
export async function status ( fileOps: FileOps, directory: string ) {
  const suggestions = await suggestInit ( fileOps, directory )
  console.log ( 'suggestions', suggestions )
}