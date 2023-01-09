import { CommandDefn, Config, ConfigWithDebug, Details, PackageDetails, PackageDetailsAndDirectory, PackageJson, RawConfig, ScriptDefn } from "./config";
import * as path from "path";
import { groupBy } from "./utils";
// @ts-ignore
import { Validate } from "@laoban/validation";
import { checkLoadingTemplates } from "./loadingTemplates";
import { flatten } from "@laoban/utils";
import { FileOps } from "@laoban/fileOps";


export function validateLaobanJson ( v: Validate<RawConfig> ): Validate<RawConfig> {
  return v.isString ( 'versionFile', `The versionFile is the location of the 'project version number', used during update` )
    .isNameAnd('templates', 'The templates object defines the names of the templates, and the urls of those templates').//
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


export function validatePackageDetailsAndTemplates ( fileOps: FileOps, c: ConfigWithDebug, pds: PackageDetailsAndDirectory[] ): Promise<string[]> {
  let nameAndDirectories = pds.map ( pd => ({ name: pd.packageDetails.name, directory: pd.directory }) )
  let grouped = groupBy ( nameAndDirectories, nd => nd.name )
  let duplicateErrors = flatten ( Object.keys ( grouped ).map ( key =>
    grouped[ key ].length > 1 ?
      [ `Have multiple projects with same mame`, ...grouped[ key ].map ( g => `${g.name} ${g.directory}` ) ] :
      [] ) )
  if ( duplicateErrors.length > 0 ) return Promise.resolve ( duplicateErrors )
  let pdsIssues: string[] = flatten ( pds.map ( pd => validatePackageDetails ( Validate.validate ( `Project details in ${pd.directory}`, pd.packageDetails ) ).errors ) )

  return pdsIssues.length > 0 ?
    Promise.resolve ( pdsIssues ) :
    checkLoadingTemplates(`Checking all templates`, fileOps, c, c.templates)

  // Promise.all ( removeDuplicates ( pds.map ( d => d.projectDetails.template ) ).sort ().map ( template =>
  //     validateTemplateDirectory ( `Template Directory`, c, template ) ) ).then ( flatten );
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
    isObject ( "details", validateDetails )
}

function validateDetails ( v: Validate<Details> ) {
  return v.isBoolean ( "publish", 'Should the project be published' ).//
    // isArrayofObjects('links', v => v).//
    optObject ( "extraDeps", v => v, 'These are added to package.json dependencies' ).//
    optObject ( "extraDevDeps", v => v, 'These are added to package.json devDependencies' ).//
    optObject ( "extraBins", v => v, 'These are added to package.json bin' )
}
function validatePackageJson ( v: Validate<PackageJson> ) {
  return v.isObject ( 'dependencies', v => v )
}
