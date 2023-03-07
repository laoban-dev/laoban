//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import path from "path";
import { ConfigWithDebug, PackageAction, PackageDetails, PackageDetailsAndDirectory, PackageDetailsDirectoryPropertiesAndVersion } from "./config";
import { derefence, dollarsBracesVarDefn, mustachesVariableDefn, VariableDefn } from "@laoban/variables";
import { loadVersionFile } from "./modifyPackageJson";
import { DebugCommands } from "@laoban/debug";
import { ErrorsAnd, findPart, fromEntries, hasErrors, nextMajorVersion, nextVersion, safeArray, safeObject } from "@laoban/utils";
import { chainPostProcessFn, combineTransformFns, CopyFileOptions, copyFromTemplate, defaultPostProcessors, FileOps, FileOpsAndXml, loadFileFromDetails, loadTemplateControlFile, parseJson, TemplateControlFile, TemplateFileIntermediate, TransformTextFn } from "@laoban/fileops";

import { postProcessForPackageJson } from "@laoban/node";


interface UpdateCmdOptions {
  setVersion?: string;
  minor?: string
  major?: string
  dryrun?: boolean
}
// export function copyTemplateDirectoryByConfig ( fileOps: FileOps, config: ConfigWithDebug, p: PackageDetailsDirectoryPropertiesAndVersion, template: string, target: string ): Promise<void> {
//   console.log ( 'copyTemplateDirectoryByConfig', config.templateDir, template )
//   let src = path.join ( config.templateDir, template );
//   let d = config.debug ( 'update' );
//   return d.k ( () => `copyTemplateDirectory directory from ${src}, to ${target}`, async () => {
//     fse.copySync ( src, target )
//     // no idea why the fse.copy doesn't work here... it just fails silently
//     let packageJsonFileName = path.join ( p.directory, 'package.json' );
//     const exists = await fileOps.isFile ( packageJsonFileName )
//     if ( !exists ) return Promise.resolve ()
//     const raw = await d.k ( () => `${p.directory} loadPackageJson`, () => fileOps.loadFileOrUrl ( packageJsonFileName ) )
//     return d.k ( () => `${p.directory} savePackageJsonFile`, () => savePackageJsonFile ( p.directory, modifyPackageJson ( JSON.parse ( raw ), p.version, p.packageDetails ) ) )
//   } )
// }

export const includeFiles = ( fileOpsAndXml: FileOpsAndXml ): TransformTextFn => async ( type: string, text: string ): Promise<string> => {
  let regExp = /\${include\(([^)]*)\)/g;
  const { fileOps } = fileOpsAndXml
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
    if ( type === '{{}}' ) return mustachesVariableDefn
    if ( type === undefined ) return undefined
    throw new Error ( `${context}. Unexpected type ${type}` )
  }
  return Promise.resolve ( derefence ( context, dic, text, { throwError: true, variableDefn: variableDefn (), allowUndefined: true, undefinedIs: '' } ) )
};


export const includeAndTransformFile = ( context: string, dic: any, fileOpsAndXml: FileOpsAndXml ): TransformTextFn =>
  combineTransformFns ( includeFiles ( fileOpsAndXml ), transformFile ( context, dic ) )

export async function loadTemplateControlFileOld ( context: string, fileOps: FileOps, laobanDirectory: string | undefined, templateControlFileUrl: string ): Promise<TemplateControlFile> {
  function findPrefix () {
    if ( templateControlFileUrl.includes ( '://' ) || templateControlFileUrl.startsWith ( '@' ) ) return templateControlFileUrl
    if ( laobanDirectory ) path.join ( laobanDirectory, templateControlFileUrl );
    return templateControlFileUrl
    // throw Error ( `${context}. Cannot access ${templateControlFileUrl} as it is not a url` )
  }
  const prefix = findPrefix ()
  const url = prefix + '/.template.json';
  return fileOps.loadFileOrUrl ( url ).then ( parseJson ( context + `\n from url ${url}` ) );
}


export const loadOneFileFromTemplateControlFileDetails = ( context: string, fileOpsAndXml: FileOpsAndXml, templateControlFileUrl: string, options: CopyFileOptions ) => async ( file: string ): Promise<ErrorsAnd<string>> => {
  const controlFile: ErrorsAnd<TemplateFileIntermediate> = await loadTemplateControlFile ( context, fileOpsAndXml ) ( file )
  if ( hasErrors ( controlFile ) ) return controlFile
  const cfd = findPart ( controlFile.files, file )
  if ( cfd === undefined ) throw Error ( `${context}. Cannot find ${file} in file ${templateControlFileUrl}\nControl file is ${JSON.stringify ( controlFile, null, 2 )}` )
  const { target, postProcessed } = await loadFileFromDetails ( context, fileOpsAndXml, templateControlFileUrl, options, cfd )
  return postProcessed
};
export async function copyTemplateDirectoryFromConfigFile ( fileOpsAndXml: FileOpsAndXml, d: DebugCommands, laobanDirectory: string, templateUrl: string, p: PackageDetailsAndDirectory, options: CopyFileOptions ): Promise<void> {
  return copyFromTemplate ( `Copying template files from ${templateUrl} to ${p.directory}`, fileOpsAndXml, options, templateUrl, p.directory )
  // const prefix = templateUrl.includes ( ':' ) || templateUrl.startsWith ( '@' ) ? templateUrl : path.join ( laobanDirectory, templateUrl )
  // const controlFile: ErrorsAnd<TemplateFileIntermediate> = await loadTemplateControlFile ( `Error copying template file in ${p.directory}`, fileOpsAndXml ) ( prefix );
  // console.log ( 'controlFile', controlFile )
  // if ( hasErrors ( controlFile ) ) {
  //   reportErrors ( controlFile );
  //   return
  // }
  // d.message ( () => [ `template control file ${prefix} for ${p.directory} is `, controlFile ] )
  // if ( controlFile.files === undefined ) {throw Error ( `Template control file ${prefix} is malformed. It is missing the files property` )}
  // const target = p.directory
  // return copyFiles ( `Copying template ${templateUrl} to ${target}`, fileOpsAndXml, d, prefix, target,
  //   options ) ( safeArray ( controlFile.files ) )
}
export function copyTemplateDirectory ( fileOpsAndXml: FileOpsAndXml, config: ConfigWithDebug, p: PackageDetailsDirectoryPropertiesAndVersion, options: CopyFileOptions ): Promise<void> {
  let d = config.debug ( 'update' )
  const template = p.packageDetails?.template
  const target = p.directory
  const namedTemplateUrl = safeObject ( config.templates )[ template ]
  d.message ( () => [ `namedTemplateUrl in ${target} for ${template} is ${namedTemplateUrl} (should be undefined if using local template)` ] )
  if ( namedTemplateUrl === undefined ) {
    console.error ( `Cannot find template ${template} for ${target}. Legal values are [${Object.keys ( config.templates )}]` )
    return
  }
  return copyTemplateDirectoryFromConfigFile ( fileOpsAndXml, d, config.laobanDirectory, namedTemplateUrl, p, options )
}
let lastVersion: string | undefined = undefined
export async function updateVersionIfNeeded ( fileOps: FileOps, config: ConfigWithDebug, cmd: UpdateCmdOptions ) {

  const set = [ cmd.setVersion, cmd.minor, cmd.major ].filter ( x => x !== undefined )
  if ( set.length > 1 ) throw Error ( `Cannot set version and increment version at the same time` )
  let d = config.debug ( 'update' )
  async function setVersion ( v: string ) {
    d.message ( () => [ `Setting version to ${cmd.setVersion}` ] )
    if ( lastVersion !== v ) console.log ( 'Version number is now', v )
    lastVersion = v
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
interface DryRunAndAllowSamples {
  dryrun?: boolean
  allowsamples?: boolean
}
export function makeCopyOptions ( context: string, fileOpsAndXml: FileOpsAndXml, cmd: DryRunAndAllowSamples, config: ConfigWithDebug, version: string | undefined, p: PackageDetailsAndDirectory | undefined ): CopyFileOptions {
  const packageDetails: PackageDetails | undefined = p?.packageDetails
  const allowSamples = cmd.allowsamples
  let lookupForJsonMergeInto = { ...config, version, packageDetails, links: { dependencies: fromEntries ( ...(safeArray ( packageDetails?.links ).map<[ string, string ]> ( s => [ s, version ] )) ) } };
  const tx = includeAndTransformFile ( context, lookupForJsonMergeInto, fileOpsAndXml );
  return {
    allowSamples, dryrun: cmd.dryrun,
    postProcessor: chainPostProcessFn ( defaultPostProcessors, postProcessForPackageJson ),
    lookupForJsonMergeInto, tx
  };
}
export const updateConfigFilesFromTemplates = ( fileOpsAndXml: FileOpsAndXml ): PackageAction<void[]> => async ( config: ConfigWithDebug, cmd: any, pds: PackageDetailsAndDirectory[] ) => {
  let d = config.debug ( 'update' )
  const { fileOps } = fileOpsAndXml
  const version = await updateVersionIfNeeded ( fileOps, config, cmd )
  return Promise.all ( pds.map ( async pd => {
    const copyOptions = makeCopyOptions ( `updating ${pd.directory}`, fileOpsAndXml, cmd, config, version, pd );
    return d.k ( () => `${pd.directory} copyTemplateDirectory`, () =>
      copyTemplateDirectory ( fileOpsAndXml, config,
        { ...pd, version, properties: safeObject ( config.properties ) },
        copyOptions ) )
    // const raw = await d.k ( () => `${p.directory} loadPackageJson`, () => fileOpsNode.loadFileOrUrl ( path.join ( p.directory, 'package.json' ) ) )
    // return d.k ( () => `${p.directory} saveProjectJsonFile`, () => saveProjectJsonFile ( p.directory, modifyPackageJson ( JSON.parse ( raw ), version, p.projectDetails ) ) )
  } ) )
}