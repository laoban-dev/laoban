import { status } from "./status";
import { FileOps } from "@phil-rice/utils";

export class LaobanAdmin {
  private params: string[];
  private program: any;
  private parsed: any;
  public constructor ( fileOps: FileOps,directory: string, params: string[] ) {
    this.params = params;
    const version = require ( "../../package.json" ).version
    var program = require ( 'commander' )
      .arguments ( '' )
      .option ( '-c, --cachestats', "show how the cache was impacted by this command", false )
      .option ( '--load.laoban.debug' ).version ( version )//
    this.program = program

    program.command ( 'status' ).description ( 'Gives a summary of the status of laoban installations' )
      .action ( cmd => status (fileOps, directory ) )

  }

  start () {
    // console.log('starting', argv)
    if ( this.params.length == 2 ) {
      this.program.outputHelp ();
      return Promise.resolve ()
    }
    this.parsed = this.program.parseAsync ( this.params ); // notice that we have to parse in a new statement.
    return this.parsed
  }


}