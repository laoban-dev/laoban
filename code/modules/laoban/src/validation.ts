//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { CommandDefn, Config, ConfigWithDebug, Guards, PackageDetails, PackageDetailsAndDirectory, PackageJson, RawConfig, ScriptDefn } from "./config";
import * as path from "path";
import { groupBy } from "./utils";
// @ts-ignore
import { Validate } from "@laoban/validation";
import { checkLoadingTemplates } from "./loadingTemplates";
import { flatten } from "@laoban/utils";
import { FileOps } from "@laoban/fileops";


export function validateLaobanJson ( v: Validate<RawConfig> ): Validate<RawConfig> {
  return v.isString ( 'versionFile', `The versionFile is the location of the 'project version number', used during update` )
    .isNameAnd ( 'templates', 'The templates object defines the names of the templates, and the urls of those templates' ).//
    isString ( 'log', `This is used to say what the name of the log file in the project directory. It is typically '.log'. The output from commands is written here` ).//
    isString ( 'status', `This is the file used to record the success or failure of commands (such as 'test')` ).//
    isString ( 'profile', 'This is used to record how long things took to run' ).//
    isString ( 'packageManager', 'Typically npm or yarn' ).//1
    isObjectofObjects<ScriptDefn> ( 'scripts', validateScriptDefn )
}

function validateScriptDefn ( v: Validate<ScriptDefn> ) {
  return v.isString ( 'description' ).//
    isArrayofObjects ( 'commands', validateCommand )
}

function validateCommand ( v: Validate<CommandDefn | string> ) {
  if ( typeof v.t === 'string' ) return v;
  let vdefn: Validate<CommandDefn> = <any>v
  return vdefn.isString ( 'command' )
}


export async function validatePackageDetailsAndTemplates ( fileOps: FileOps, c: ConfigWithDebug, pds: PackageDetailsAndDirectory[] ): Promise<string[]> {
  const detailsIssues = pds.filter ( pd => !pd.packageDetails ).map ( ( { directory, errorParsing } ) =>
    `Directory ${directory} has ${errorParsing ? 'invalid json in' : 'no '} package.details.json file` )
  const goodPds = pds.filter ( pd => pd.packageDetails );
  let nameAndDirectories = goodPds.map ( pd => ({ name: pd.packageDetails.name, directory: pd.directory }) )
  let grouped = groupBy ( nameAndDirectories, nd => nd.name )
  let duplicateErrors = flatten ( Object.keys ( grouped ).map ( key =>
    grouped[ key ].length > 1 ?
      [ `Have multiple projects with same Name`, ...grouped[ key ].map ( g => `   ${g.name} ${g.directory}` ) ] :
      [] ) )
  let pdsIssues: string[] = flatten ( goodPds.map ( pd => validatePackageDetails ( Validate.validate ( `Project details in ${pd.directory}`, pd.packageDetails ) ).errors ) )

  const templateIssues = await checkLoadingTemplates ( `Checking all templates`, fileOps, c, c.templates );
  const allIssues = [ ...detailsIssues, ...duplicateErrors, ...pdsIssues, ...templateIssues ]
  return allIssues
}

function validateTemplateDirectory ( context: string, c: Config, templateDir: string ): Promise<string[]> {
  let dir = path.join ( c.templateDir, templateDir );
  return Validate.validateDirectoryExists ( context, dir ).then ( dirErrors => dirErrors.length === 0 ?
    Validate.validateFile ( `package.json in template directory ${templateDir}`, path.join ( dir, 'package.json' ), validatePackageJson ) :
    dirErrors )
}

function validatePackageDetails ( v: Validate<PackageDetails> ) {
  return v.isString ( "name" ).//
    isString ( "description" ).//
    isString ( "template" ).//
    isObject ( "guards", validateGuards )
}

function validateGuards ( v: Validate<Guards> ) {
  return v.isBoolean ( "publish", 'Should the project be published' )//
    // isArrayofObjects('links', v => v).//
    // optObject ( "extraDeps", v => v, 'These are added to package.json dependencies' ).//
    // optObject ( "extraDevDeps", v => v, 'These are added to package.json devDependencies' ).//
    // optObject ( "extraBins", v => v, 'These are added to package.json bin' )
}
function validatePackageJson ( v: Validate<PackageJson> ) {
  return v.isObject ( 'dependencies', v => v )
}
