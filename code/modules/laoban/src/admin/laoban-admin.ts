//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { NameAnd } from "@laoban/utils";
import { init } from "./init";
import { packages } from "./packages";
import { newPackage } from "./newPackage";
import { FileOps } from "@laoban/fileops";
import { makeIntoTemplate, newTemplate, updateAllTemplates } from "./newTemplate";
import { loabanConfigTestName, packageDetailsTestFile } from "../Files";

const initUrl = ( envs: NameAnd<string> ) => {
  let env = envs[ 'LAOBANINITURL' ];
  return env ? env : "@laoban@/init/allInits.json";
};

function initUrlOption<T> ( envs: NameAnd<string>, p: T ): T {
  const a: any = p
  const defaultInitUrl = initUrl ( envs );
  a.option ( '--listTypes', "lists the types of projects that can be created (and doesn't create anything)", false )
    .option ( '-i,--initurl <initurl>', "The url that allows the types to be decoded. Used for testing and or if you have your own set", defaultInitUrl )
    .option ( '-l,--legaltypes <legal...>', "the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes. Defaults to the list returned by --listtypes", )
  return p
}
function initOptions<T> ( envs: NameAnd<string>, p: T ): T {
  const a: any = initUrlOption ( envs, p )
  const defaultInitUrl = initUrl ( envs );
  a.option ( '-t,--type <type>', "the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes", 'typescript' )
  return p
}

export class LaobanAdmin {
  private params: string[];
  private program: any;
  private parsed: any;
  public constructor ( fileOps: FileOps, currentDirectory: string, envs: NameAnd<string>, params: string[] ) {
    this.params = params;
    const version = require ( "../../../package.json" ).version
    let program = require ( 'commander' )
    this.program = program.version ( version )

    initOptions ( envs, program.command ( 'init' )
      .description ( 'Gives a summary of the initStatus of laoban installations' )
      .action ( cmd => init ( fileOps, currentDirectory, cmd ) )
      .option ( '-d,--dryrun', `The dry run creates files ${loabanConfigTestName} and ${packageDetailsTestFile} to allow previews and comparisons`, false )
      .option ( '--force', 'Without a force, this will not create files, but will instead just detail what it would do', false ) )
    initUrlOption ( envs, program.command ( 'packages' )
      .description ( 'Gives a summary of the packages that laoban-admin has detected' )
      .action ( cmd => packages ( fileOps, currentDirectory, cmd ) ) )
    initOptions ( envs, program.command ( 'newpackage <init>' ) )
      .description ( 'Creates a new package under the current directory with the specified type' )
      .option ( '--template <template>', 'The template to use. Defaults to the type' )
      .option ( '-p,--packagename <packagename>', 'The name of the package, defaults to the directory name' )
      .option ( '-d,--desc <desc>', 'The description of the package, defaults to an empty string' )
      .option ( '--nuke', 'If the directory already exists, it will be deleted and recreated', false )
      .option ( '--force', 'Will create even if the package already exists ', false )
      .action ( ( name, cmd ) => newPackage ( fileOps, currentDirectory, name, cmd ) )

    initUrlOption ( envs, program.command ( 'newtemplate' )
      .description ( `Creates a templates from the specified directory (copies files to template dir)` )
      .action ( cmd => newTemplate ( fileOps, currentDirectory, cmd ) ) )
      .option ( '--directory <directory>', 'The directory to use as the source. Defaults to the current directory.' )
      .option ( '-d,--dryrun', `Just displays the files that would be created` )
      .option ( '-t,--template <template>', `The template directory (each template will be a directory under here)`, fileOps.join ( currentDirectory, 'templates' ) )
      .option ( '-n,--templatename <templatename>', `Where to put the template files` )
    initUrlOption ( envs, program.command ( 'makeintotemplate' )
      .description ( `turns the specified directory into a template directory (just adds a .template.json and update laoban.json'). Note if existing .template.json file exists will use data from it ` )
      .action ( cmd => makeIntoTemplate ( fileOps, currentDirectory, cmd ) ) )
      .option ( '--directory <directory>', 'The directory to use. Defaults to the current directory.' )
      .option ( '-d,--dryrun', `Just displays the files that would be created` )
    initUrlOption ( envs, program.command ( 'updatealltemplates' )
      .description ( `all subdirectories that are templates are 'makeintotemplate'ed, which means if you add files to them and run this, they are added to the templates` )
      .action ( cmd => updateAllTemplates ( fileOps, currentDirectory, cmd ) ) )
      .option ( '--directory <directory>', 'The directory to use. Defaults to the current directory.' )
      .option ( '-d,--dryrun', `Just displays the files that would be created` )


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