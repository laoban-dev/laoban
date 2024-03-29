//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { NameAnd, reportErrors } from "@laoban/utils";
import { gatherInitData, init, InitData, isSuccessfulInitData } from "./init";
import { analyze } from "./analyze";
import { newPackage } from "./newPackage";
import { CopyFileOptions, FileOps, FileOpsAndXml } from "@laoban/fileops";
import { makeIntoTemplate, newTemplate, updateAllTemplates } from "./newTemplate";
import { loabanConfigTestName, PackageDetailFiles, packageDetailsFile, packageDetailsTestFile } from "../Files";
import { ConfigAndIssues, ConfigWithDebug } from "@laoban/config";
import { abortWithReportIfAnyIssues, loadLaobanAndIssues, makeCache } from "../configProcessor";
import { Writable } from "stream";
import { findProfilesFromString, loadProfile, prettyPrintProfileData, prettyPrintProfiles } from "../profiling";
import { output } from "../utils";
import { addDebug } from "@laoban/debug";
import { validatePackageDetailsAndTemplates } from "../validation";
import { ActionParams } from "./types";
import { Command } from "commander";
import { updateTemplate, updateTemplateOptions } from "./update-template";
import { postCommand } from "../postCommand";
import { ErrorsAnd, hasErrors } from "@laoban/utils/dist/src/errors";
import { makeCopyOptions } from "../update";

const initUrl = ( envs: NameAnd<string> ) => {
  let env = envs[ 'LAOBANINITURL' ];
  return env ? env : "@laoban@/init/allInits.json";
};

function initUrlOption<T extends Command> ( envs: NameAnd<string>, p: T ): T {
  p.option ( '--listTypes', "lists the types of projects that can be created (and doesn't create anything)", false )
    .option ( '-l,--legaltypes <legal...>', "the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes. Defaults to the list returned by --listtypes", )
  return p
}
function initOptions<T extends Command> ( envs: NameAnd<string>, p: T ): T {
  return justInitUrl ( envs, p ).option ( '-t,--type <type>', "the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes", 'typescript' )
}
function justInitUrl<T extends Command> ( envs: NameAnd<string>, p: T ): T {
  const defaultInitUrl = initUrl ( envs );
  return p.option ( '-i,--initurl <initurl>', "The url that allows the types to be decoded. Used for testing and or if you have your own set", defaultInitUrl )

}


export async function loadConfigForAdmin ( fileOpsAndXml: FileOpsAndXml, cmd: any, currentDirectory: string, params: string[], outputStream: Writable ): Promise<ConfigWithDebug> {
  const configAndIssues: ConfigAndIssues = await loadLaobanAndIssues ( fileOpsAndXml, makeCache ) ( process.cwd (), params, outputStream )
  const config = await abortWithReportIfAnyIssues ( configAndIssues );
  return addDebug ( cmd.debug, x => console.log ( '#', ...x ) ) ( config )
}

async function clearCache ( { fileOpsAndXml, cmd, currentDirectory, params, outputStream }: ActionParams<any> ): Promise<void> {
  const { fileOps } = fileOpsAndXml
  const config = await loadConfigForAdmin ( fileOpsAndXml, cmd, currentDirectory, params, outputStream )
  if ( config.cacheDir )
    return fileOps.removeDirectory ( config.cacheDir, true )
  else
    console.log ( 'Cache directory is not defined in laoban.json' )

}
async function profile ( { fileOpsAndXml, cmd, currentDirectory, params, outputStream }: ActionParams<any> ): Promise<void> {
  const { fileOps } = fileOpsAndXml
  const config: ConfigWithDebug = await loadConfigForAdmin ( fileOpsAndXml, cmd, currentDirectory, params, outputStream )
  const pds = await PackageDetailFiles.workOutPackageDetails ( fileOps, config, cmd )
  await Promise.all ( pds.map ( d => loadProfile ( config, d.directory ).then ( p => ({ directory: d.directory, profile: findProfilesFromString ( p ) }) ) ) ).//
    then ( p => {
      let data = prettyPrintProfileData ( p );

      prettyPrintProfiles ( output ( config ), 'latest', data, p => (p.latest / 1000).toFixed ( 3 ) )
      output ( config ) ( '' )
      prettyPrintProfiles ( output ( config ), 'average', data, p => (p.average / 1000).toFixed ( 3 ) )
    } )
}
async function config ( { fileOpsAndXml, cmd, currentDirectory, params, outputStream }: ActionParams<any> ) {
  const { fileOps } = fileOpsAndXml
  const config: ConfigWithDebug = await loadConfigForAdmin ( fileOpsAndXml, cmd, currentDirectory, params, outputStream )
  let simpleConfig = { ...config }
  if ( !cmd.all ) delete simpleConfig.scripts
  delete simpleConfig.outputStream
  output ( config ) ( JSON.stringify ( simpleConfig, null, 2 ) )
}


async function validate ( { fileOpsAndXml, cmd, currentDirectory, params, outputStream, copyOptions }: ActionParams<any> ): Promise<void> {
  const { fileOps } = fileOpsAndXml
  const config: ConfigWithDebug = await loadConfigForAdmin ( fileOpsAndXml, cmd, currentDirectory, params, outputStream )
  const pds = await PackageDetailFiles.workOutPackageDetails ( fileOps, config, cmd )
  const issues = await validatePackageDetailsAndTemplates ( fileOpsAndXml, config, copyOptions, pds )
  await abortWithReportIfAnyIssues ( { config, outputStream: config.outputStream, issues, params, fileOpsAndXml } )
}

async function templates ( { fileOpsAndXml, cmd, currentDirectory, params, outputStream }: ActionParams<any> ): Promise<void> {
  const { fileOps } = fileOpsAndXml
  const configAndIssues: ConfigAndIssues = await loadLaobanAndIssues ( fileOpsAndXml, makeCache ) ( process.cwd (), params, outputStream )
  if ( configAndIssues.config ) {
    console.log ( 'templates', configAndIssues.config.templates )
  } else {
    const initData: ErrorsAnd<InitData> = await gatherInitData ( fileOps, currentDirectory, cmd, false );
    if ( hasErrors ( initData ) ) {
      console.log ( 'Could not successfully load the init data' )
      reportErrors ( initData )
      return
    }
    if ( isSuccessfulInitData ( initData ) ) {
      console.log ( 'templates', initData.parsedLaoBan.templates )
    } else {
      console.log ( `Had problems with the configuration, couldn't work out the templates to use` )
      const { suggestions } = initData;
      suggestions.comments.forEach ( c => console.log ( c ) )
    }
  }
}

export class LaobanAdmin {
  private params: string[];
  private program: any;
  private parsed: any;
  public constructor ( fileOpsAndXml: FileOpsAndXml, currentDirectory: string, envs: NameAnd<string>, params: string[], outputStream: Writable ) {
    this.params = params;
    const { fileOps } = fileOpsAndXml
    let program = require ( 'commander' )
    this.program = program.name ( 'laoban admin' ).usage ( '<command> [options]' ).option ( '--load.laoban.debug' )
    const addCommand = ( name: string, description: string, fn: ( ActionParams ) => Promise<void>, moreOptions?: ( env: NameAnd<string>, p: any ) => void ) => {
      let thisP = program.command ( name )
        .description ( description )
        .action ( cmd => fn ( { fileOpsAndXml, currentDirectory, cmd, params, outputStream } ) )
      if ( moreOptions ) moreOptions ( envs, thisP )
      return thisP
    };

    addCommand ( 'clearcache', 'clears the cache. ', clearCache )
    addCommand ( 'config', 'displays the config', config )
      .option ( '--all', 'includes the scripts', false )

    addCommand ( 'init', `creates a laoban.json/package.json.details and helps 'get started'`, init, initOptions )
      .option ( '-d,--dryrun', `The dry run creates files ${loabanConfigTestName} and ${packageDetailsTestFile} to allow previews and comparisons`, false )
      .option ( '--cleantestfiles', 'Will clean any test files created by the --dryrun', false )
      .option ( '--force', `This is used to say 'overwrite existing files'`, false )
      .option ( '-p, --packages <packages>', "only executes this in the packages matching the regex. e.g. -p 'name' (so no laoban.json/version.txt)", "" )
      .option ( '--usetemplate <template>', `By default templates are 'detected'. You can 'force' templates using this. Commonly used with '--usetemplate javascript' and with the '-p' option`, undefined )
    //
    addCommand ( 'analyze', 'Gives a summary of the packages that laoban admin has detected"', analyze, justInitUrl )
      .option ( '--showimpact', "Shows dependencies and devDependencies that would be impacted by the change" )
      .option ( '-p, --packages <packages>', "executes this in the packages matching the regex. e.g. -p 'name'", "" )


    initOptions ( envs, program.command ( 'newpackage [directory]' ) )
      .description ( 'Creates a new package. Defaults to the current directory if one is not specified' )
      .option ( '--template <template>', 'The template to use. Defaults to the type' )
      .option ( '-p,--packagename <packagename>', `The name of the package, defaults to the directory name` )
      .option ( '-d,--desc <desc>', 'The description of the package, defaults to an empty string' )
      .option ( '--nuke', 'If the directory already exists, it will be deleted and recreated', false )
      .option ( '--force', 'Will create even if the package already exists ', false )
      .action ( ( name, cmd ) => newPackage ( fileOpsAndXml, currentDirectory, name, cmd, params, outputStream ).then ( postCommand ( program, fileOps ) ) )

    addCommand ( 'newtemplate', `Creates a templates from the specified directory (copies files to template dir). It will usually make far too many files!`, newTemplate, initUrlOption )
      .option ( '--directory <directory>', 'The directory to use as the source. Defaults to the current directory.' )
      .option ( '-d,--dryrun', `Just displays the files that would be created` )
      .option ( '-t,--template <template>', `The template directory (each template will be a directory under here)`, fileOps.join ( currentDirectory, 'templates' ) )
      .option ( '-n,--templatename <templatename>', `Where to put the template files` )
    addCommand ( 'templates', 'Lists the legal templates', templates, justInitUrl )
    addCommand ( 'updatetemplate', `Updates the template from the current (or specified) directory. Allows you to edit package.json here, and change the template from that`, updateTemplate, updateTemplateOptions )
    addCommand ( 'makeintotemplate', `turns the specified directory into a template directory (just adds a .template.json and update laoban.json'). This is most often used on existing templates after the files have been changed. Note that if the '.template.json' file exists data from it will be used`, makeIntoTemplate, initUrlOption )
      .option ( '--directory <directory>', 'The directory to use. Defaults to the current directory.' )
      .option ( '-d,--dryrun', `Just displays the files that would be created` )
    addCommand ( 'makealltemplates', `all subdirectories that are 'makeintotemplate'ed`, updateAllTemplates, initUrlOption )
      .option ( '--directory <directory>', 'The directory to use. Defaults to the current directory.' )
      .option ( '-d,--dryrun', `Just displays the files that would be created` )
    addCommand ( 'validate', `checks the laoban.json and the ${packageDetailsFile}`, validate )
    addCommand ( 'profile', `Displays how long some actions took (the ones that appear in 'laoban status')`, profile )
  }

  start () {
    if ( this.params.length == 2 ) {
      this.program.outputHelp ();
      return Promise.resolve ()
    }
    this.parsed = this.program.parseAsync ( this.params ); // notice that we have to parse in a new statement.
    return this.parsed
  }

}

