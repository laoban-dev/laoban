import { deepCombineTwoObjects } from "@laoban/utils";
import { FileOps, parseJson, PostProcessFn } from "@laoban/fileops";

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

export const postProcessTurnPackageJsonIntoTemplate: PostProcessFn = () =>
  async ( text: string, p: string ): Promise<string> => { if ( p === 'turnIntoPackageJsonTemplate' ) return turnPackageJsonIntoTemplate ( text ); }

