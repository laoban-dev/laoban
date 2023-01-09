import path from "path";
import { ConfigWithDebug, PackageAction, PackageDetailsAndDirectory, PackageDetailsDirectoryPropertiesAndVersion } from "./config";
import * as fse from "fs-extra";
import { derefence, dollarsBracesVarDefn, VariableDefn } from "@laoban/variables";
import { loadVersionFile, modifyPackageJson, savePackageJsonFile } from "./modifyPackageJson";
import { DebugCommands } from "@laoban/debug";
import { nextMajorVersion, nextVersion, safeArray, safeObject } from "@laoban/utils";
import { CopyFileDetails, copyFiles, fileNameFrom, FileOps, loadFileFromDetails, parseJson } from "@laoban/fileops";


interface UpdateCmdOptions {
  setVersion?: string;
  minor?: string
  major?: string
  dryrun?: boolean
}
export function copyTemplateDirectoryByConfig ( fileOps: FileOps, config: ConfigWithDebug, p: PackageDetailsDirectoryPropertiesAndVersion, template: string, target: string ): Promise<void> {
  let src = path.join ( config.templateDir, template );
  let d = config.debug ( 'update' );
  return d.k ( () => `copyTemplateDirectory directory from ${src}, to ${target}`, async () => {
    fse.copySync ( src, target )
    // no idea why the fse.copy doesn't work here... it just fails silently
    let packageJsonFileName = path.join ( p.directory, 'package.json' );
    const exists = await fileOps.isFile ( packageJsonFileName )
    if ( !exists ) return Promise.resolve ()
    const raw = await d.k ( () => `${p.directory} loadPackageJson`, () => fileOps.loadFileOrUrl ( packageJsonFileName ) )
    return d.k ( () => `${p.directory} savePackageJsonFile`, () => savePackageJsonFile ( p.directory, modifyPackageJson ( JSON.parse ( raw ), p.version, p.packageDetails ) ) )
  } )
}
export interface TemplateControlFile {
  files: CopyFileDetails[]
}
export const includeFiles = ( fileOps: FileOps ): TransformTextFn => async ( type: string, text: string ): Promise<string> => {
  let regExp = /\${include\(([^)]*)\)/g;
  const includes = text.match ( regExp )
  if ( !includes ) return Promise.resolve ( text )
  const urlsAndContent: string [][] = await Promise.all<string[]> ( includes.map ( ( includeStr ) => {
    let url = includeStr.slice ( 10, -1 );
    return fileOps.loadFileOrUrl ( url ).then ( text => [ includeStr, text ] );
  } ) )
  return text.replace ( regExp, url => urlsAndContent.find ( (urlsAndContent => urlsAndContent[ 0 ] === url) )[ 1 ] )
};

export const transformFile = ( context: string, dic: any ): TransformTextFn => ( type: string, text: string ): Promise<string> => {
  function variableDefn (): VariableDefn | undefined {
    if ( type === '${}' ) return dollarsBracesVarDefn
    if ( type === undefined ) return undefined
    throw new Error ( `${context}. Unexpected type ${type}` )
  }
  return Promise.resolve ( derefence ( context, dic, text, { throwError: true, variableDefn: variableDefn (), allowUndefined: true, undefinedIs: '' } ) )
};

type TransformTextFn = ( type: string, text: string ) => Promise<string>
export function combineTransformFns ( ...fns: TransformTextFn[] ): TransformTextFn {
  return ( type, text ) => fns.reduce <Promise<string>> ( async ( acc, fn ) => fn ( type, await acc ), Promise.resolve ( text ) )
}

export const includeAndTransformFile = ( context: string, dic: any, fileOps: FileOps ): TransformTextFn =>
  combineTransformFns ( includeFiles ( fileOps ), transformFile ( context, dic ) )

export async function loadTemplateControlFile ( context: string, fileOps: FileOps, laobanDirectory: string | undefined, templateControlFileUrl: string ): Promise<TemplateControlFile> {
  function findPrefix () {
    if ( templateControlFileUrl.includes ( '://' ) || templateControlFileUrl.startsWith ( '@' ) ) return templateControlFileUrl
    if ( laobanDirectory ) path.join ( laobanDirectory, templateControlFileUrl );
    throw Error ( `${context}. Cannot access ${templateControlFileUrl} as it is not a url` )
  }
  const prefix = findPrefix ()
  const url = prefix + '/.template.json';
  return fileOps.loadFileOrUrl ( url ).then ( parseJson ( context + `\n from url ${url}` ) );
}

export async function loadOneFileFromTemplateControlFileDetails ( context: string, fileOps: FileOps, templateControlFileUrl: string, tx?: ( type: string, text: string ) => Promise<string> ): Promise<string> {
  const controlFile: TemplateControlFile = await loadTemplateControlFile ( context, fileOps, undefined, templateControlFileUrl )
  const cfdForPackageJson = controlFile.files.find ( cfd => fileNameFrom ( cfd ) === 'package.json' )
  if ( cfdForPackageJson === undefined ) throw Error ( `${context}. Cannot find package.json in file ${templateControlFileUrl}\nControl file is ${JSON.stringify ( controlFile, null, 2 )}` )
  const { target, postProcessed } = await loadFileFromDetails ( context, fileOps, templateControlFileUrl, tx, cfdForPackageJson )
  return postProcessed

}
export async function copyTemplateDirectoryFromConfigFile ( fileOps: FileOps, d: DebugCommands, laobanDirectory: string, templateUrl: string, p: PackageDetailsAndDirectory, dryrun: boolean ): Promise<void> {
  const prefix = templateUrl.includes ( '://' ) || templateUrl.startsWith ( '@' ) ? templateUrl : path.join ( laobanDirectory, templateUrl )
  const controlFile = await loadTemplateControlFile ( `Error copying template file in ${p.directory}`, fileOps, laobanDirectory, prefix );
  d.message ( () => [ `control file is `, controlFile ] )
  const target = p.directory
  return copyFiles ( `Copying template ${templateUrl} to ${target}`, fileOps, d, prefix, target,
    includeAndTransformFile ( `Transforming file ${templateUrl} for ${p.directory}`, p, fileOps ), dryrun ) ( safeArray ( controlFile.files ) )
}
export function copyTemplateDirectory ( fileOps: FileOps, config: ConfigWithDebug, p: PackageDetailsDirectoryPropertiesAndVersion, dryrun: boolean ): Promise<void> {
  let d = config.debug ( 'update' )
  const template = p.packageDetails.template
  const target = p.directory
  const namedTemplateUrl = safeObject ( config.templates )[ template ]
  d.message ( () => [ `namedTemplateUrl in ${target} for ${template} is ${namedTemplateUrl} (should be undefined if using local template)` ] )
  if ( namedTemplateUrl === undefined ) return copyTemplateDirectoryByConfig ( fileOps, config, p, template, target )
  return copyTemplateDirectoryFromConfigFile ( fileOps, d, config.laobanDirectory, namedTemplateUrl, p, dryrun )
}
let lastVersion: string | undefined = undefined
export async function updateVersionIfNeeded ( fileOps: FileOps, config: ConfigWithDebug, cmd: UpdateCmdOptions ) {

  const set = [ cmd.setVersion, cmd.minor, cmd.major ].filter ( x => x !== undefined )
  if ( set.length > 1 ) throw Error ( `Cannot set version and increment version at the same time` )
  let d = config.debug ( 'update' )
  async function setVersion ( v: string ) {
    d.message ( () => [ `Setting version to ${cmd.setVersion}` ] )
    if (lastVersion !== v) console.log ( 'Version number is now', v )
    lastVersion= v
    if ( cmd.dryrun ) {
      return v
    }
    await fileOps.saveFile ( config.versionFile, v )
    return v
  }
  if ( cmd.setVersion ) return setVersion ( cmd.setVersion )
  const version = await d.k ( () => `loadVersionFile`, () => loadVersionFile ( config ) )
  if ( cmd.minor ) return setVersion ( nextVersion ( version ) )
  if ( cmd.major ) return setVersion ( nextMajorVersion ( version ) )
  return version
}
export const updateConfigFilesFromTemplates = ( fileOps: FileOps ): PackageAction<void[]> => ( config: ConfigWithDebug, cmd: any, pds: PackageDetailsAndDirectory[] ) => {
  let d = config.debug ( 'update' )

  return Promise.all ( pds.map ( async p => {
    const version = await updateVersionIfNeeded ( fileOps, config, cmd )
    return d.k ( () => `${p.directory} copyTemplateDirectory`, () =>
      copyTemplateDirectory ( fileOps, config,
        { ...p, version, properties: safeObject ( config.properties ) }, cmd.dryrun ) )
    // const raw = await d.k ( () => `${p.directory} loadPackageJson`, () => fileOpsNode.loadFileOrUrl ( path.join ( p.directory, 'package.json' ) ) )
    // return d.k ( () => `${p.directory} saveProjectJsonFile`, () => saveProjectJsonFile ( p.directory, modifyPackageJson ( JSON.parse ( raw ), version, p.projectDetails ) ) )
  } ) )
}