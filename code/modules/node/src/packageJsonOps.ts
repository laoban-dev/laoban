import { NameAnd, objectSortedByKeysWithPriority } from "@laoban/utils";
import { chainPostProcessFn, defaultPostProcessors, doAllPostProcessor, parseJson, PostProcessor } from "@laoban/fileops";
import { postProcessor } from "@laoban/fileops/dist/src/postProcessor";

function turnPackageJsonIntoTemplate ( text: string ) {
  const packageJson = JSON.parse ( text );
  if ( typeof packageJson.workspaces === 'object' ) return text
  packageJson.name = "${packageDetails.name}"
  packageJson.description = "${packageDetails.description}"
  packageJson.version = "${packageDetails.version}"
  packageJson.license = "${properties.license}"
  packageJson.repository = "${properties.repository}"
  return JSON.stringify ( packageJson, null, 2 )
}

export const postProcessTurnPackageJsonIntoTemplate: PostProcessor = postProcessor ( /^turnIntoPackageJsonTemplate$/, () =>
  async ( text: string, p: string ): Promise<string> => { if ( p === 'turnIntoPackageJsonTemplate' ) return turnPackageJsonIntoTemplate ( text ); } )


export const postProcessPackageJsonSort: PostProcessor = postProcessor ( /^packageJsonSort$/,
  () =>
    async ( text: string, p: string ): Promise<string> => {
      const json = parseJson<NameAnd<any>> ( 'packageJsonSort' ) ( text )
      const sorted = objectSortedByKeysWithPriority ( json, "name", "description", "version", "main", "types" )
      return JSON.stringify ( sorted, null, 2 )
    } )

const packageJsonMatcher = /^packageJson\((.*)\)$/;
export const postProcessPackageJson: PostProcessor = doAllPostProcessor (
  packageJsonMatcher,
  chainPostProcessFn ( defaultPostProcessors, postProcessPackageJsonSort ),
  ( cmd ) => {
    const files = cmd.match ( packageJsonMatcher )?.[ 1 ]
    const filesString = files ? files : ''
    const comma = filesString.length === 0 ? '' : ','
    return [ `jsonMergeInto(${filesString}${comma}$packageDetails.packageJson,$links)`, "packageJsonSort" ];
  } )


export const postProcessForPackageJson = chainPostProcessFn ( postProcessPackageJsonSort, postProcessPackageJson )