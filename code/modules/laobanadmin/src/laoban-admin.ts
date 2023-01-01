import { status } from "./status";
import { FileOps } from "@phil-rice/utils";
import { init } from "./init";

export class LaobanAdmin {
  private params: string[];
  private program: any;
  private parsed: any;
  public constructor ( fileOps: FileOps, directory: string, params: string[] ) {
    this.params = params;
    const version = require ( "../../package.json" ).version
    let program = require ( 'commander' )
    this.program = program

    program.command ( 'status' ).description ( 'Gives a summary of the status of laoban installations' )
      .action ( cmd => status ( fileOps, directory ) )
    program.command ( 'init' ).description ( 'Gives a summary of the status of laoban installations' )
      .action ( cmd => init ( fileOps, directory, cmd ) )
      .option ( '-t,--types <types...>', "the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes", [ 'typescript' ] )
      .option ( '-l, --listTypes', "lists the types of projects that can be created (and doesn't create anything)", false )
      .option ( '-i,--initurl <initurl>', "The url that allows the types to be decoded", "@laoban@/init/allInits.json" )
      .option ( '-d,--dryrun', 'The dry run creates files .laoban.test.json and .project.details.test.json to allow previews and comparisons', false )
      .option ( '--force', 'Without a force, this will not create files, but will instead just detail what it would do', false )

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