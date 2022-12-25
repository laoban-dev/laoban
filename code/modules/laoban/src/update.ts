import { CopyFileDetails, copyFiles, FileOps, safeArray, safeObject } from "@phil-rice/utils";
import path from "path";
import { ConfigWithDebug } from "./config";
import * as fse from "fs-extra";

export function copyTemplateDirectoryByConfig ( config: ConfigWithDebug, template: string, target: string ): Promise<void> {
  let src = path.join ( config.templateDir, template );
  let d = config.debug ( 'update' );
  return d.k ( () => `copyTemplateDirectory directory from ${src}, to ${target}`, () => {
    fse.copySync ( src, target )
    // no idea why the fse.copy doesn't work here... it just fails silently
    return Promise.resolve ()
  } )
}
interface TemplateControlFile {
  files: CopyFileDetails[]
}

// type ModifyTemplateBy = 'nothing' | 'variables'
// interface TemplateFileDetails {
//   file: string
//   modifyBy
// }
export async function copyTemplateDirectoryFromConfigFile ( fileOps: FileOps, laobanDirectory: string, templateUrl: string, target: string ): Promise<void> {

  const prefix = templateUrl.includes ( '://' ) ? templateUrl : path.join ( laobanDirectory, templateUrl )
  const url = prefix + '/.template.json';
  function parseCopyFile ( controlFileAsString: string ): TemplateControlFile {
    try {
      return JSON.parse ( controlFileAsString );
    } catch ( e ) {
      console.error ( e )
      throw new Error ( `Error copying template file in ${target} from url ${url}\n${controlFileAsString}\n` )
    }
  }
  const controlFileAsString = await fileOps.loadFileOrUrl ( url )
  const controlFile = parseCopyFile ( controlFileAsString );
  return copyFiles ( `Copying x template ${templateUrl} to ${target}`, fileOps, prefix, target ) ( safeArray ( controlFile.files ) )
}
export function copyTemplateDirectory ( fileOps: FileOps, config: ConfigWithDebug, template: string, target: string ): Promise<void> {
  let d = config.debug ( 'update' )
  const namedTemplateUrl = safeObject ( config.templates )[ template ]
  d.message ( () => [ `namedTemplateUrl in ${target} for ${template} is ${namedTemplateUrl} (should be undefined if using local template)` ] )
  if ( namedTemplateUrl === undefined ) return copyTemplateDirectoryByConfig ( config, template, target )
  return copyTemplateDirectoryFromConfigFile ( fileOps, config.laobanDirectory, namedTemplateUrl, target )
}