import { CopyFileDetails, copyFiles, FileOps, safeArray, safeObject } from "@phil-rice/utils";
import path from "path";
import { ConfigWithDebug, ProjectDetailsAndDirectory, ProjectDetailsDirectoryAndVersion } from "./config";
import * as fse from "fs-extra";
import { derefence, dollarsBracesVarDefn, VariableDefn } from "@phil-rice/variables";

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

export const transformFile = ( context: string, dic: any ) => ( type: string, text: string ): string => {
  function variableDefn (): VariableDefn {
    if ( type === '${}' ) return dollarsBracesVarDefn
    throw new Error ( `${context}. Unexpected type ${type}` )
  }
  return derefence ( context, dic, text, { throwError: true, variableDefn: variableDefn () } )
};

export async function copyTemplateDirectoryFromConfigFile ( fileOps: FileOps, laobanDirectory: string, templateUrl: string, p: ProjectDetailsAndDirectory ): Promise<void> {
  const prefix = templateUrl.includes ( '://' ) ? templateUrl : path.join ( laobanDirectory, templateUrl )
  const url = prefix + '/.template.json';
  const target = p.directory
  function parseCopyFile ( controlFileAsString: string ): TemplateControlFile {
    try {
      return JSON.parse ( controlFileAsString );
    } catch ( e ) {
      console.error ( e )
      throw new Error ( `Error copying template file in ${p.directory} from url ${url}\n${controlFileAsString}\n` )
    }
  }
  const controlFileAsString = await fileOps.loadFileOrUrl ( url )
  const controlFile = parseCopyFile ( controlFileAsString );
  return copyFiles ( `Copying x template ${templateUrl} to ${target}`, fileOps, prefix, target, transformFile ( `Transforming file ${templateUrl} for ${p.directory}`, p ) ) ( safeArray ( controlFile.files ) )
}
export function copyTemplateDirectory ( fileOps: FileOps, config: ConfigWithDebug, p: ProjectDetailsDirectoryAndVersion ): Promise<void> {
  let d = config.debug ( 'update' )
  const template = p.projectDetails.template
  const target = p.directory
  const namedTemplateUrl = safeObject ( config.templates )[ template ]
  d.message ( () => [ `namedTemplateUrl in ${target} for ${template} is ${namedTemplateUrl} (should be undefined if using local template)` ] )
  if ( namedTemplateUrl === undefined ) return copyTemplateDirectoryByConfig ( config, template, target )
  return copyTemplateDirectoryFromConfigFile ( fileOps, config.laobanDirectory, namedTemplateUrl, p )
}