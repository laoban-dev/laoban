import { FileOps, NameAnd } from "@laoban/utils";
import { init } from "./init";
import { projects } from "./projects";
import { loabanConfigTestName, packageDetailsTestFile } from "laoban/dist/src/Files";

function typeOptions<T> ( envs: NameAnd<string>,p: T ): T {
  const a: any = p
  let env = envs['LAOBANINITURL'];
  const defaultInitUrl = env?env:"@laoban@/init/allInits.json"
  a.option ( '-t,--type <type>', "the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes", 'typescript' )
    .option ( '-l,--legaltypes <legal...>', "the type of project to create. An example is 'typescript'. You can find a list of them by --listtypes. Defaults to the list returned by --listtypes", )
    .option ( '--listTypes', "lists the types of projects that can be created (and doesn't create anything)", false )
    .option ( '-i,--initurl <initurl>', "The url that allows the types to be decoded. Used for testing and or if you have your own set", defaultInitUrl )
  return p
}
export class LaobanAdmin {
  private params: string[];
  private program: any;
  private parsed: any;
  public constructor ( fileOps: FileOps, directory: string,envs: NameAnd<string>, params: string[] ) {
    this.params = params;
    const version = require ( "../../package.json" ).version
    let program = require ( 'commander' ).version ( version );
    this.program = program

    // program.command ( 'status' ).description ( 'Gives a summary of the status of laoban installations' )
    //   .action ( cmd => status ( fileOps, directory ) )
    typeOptions (envs,program.command ( 'init' )
      .description ( 'Gives a summary of the status of laoban installations' )
      .action ( cmd => init ( fileOps, directory, cmd ) )
      .option ( '-d,--dryrun', `The dry run creates files ${loabanConfigTestName} and ${packageDetailsTestFile} to allow previews and comparisons`, false )
      .option ( '--force', 'Without a force, this will not create files, but will instead just detail what it would do', false ) )
    typeOptions (envs,program.command ( 'projects' )
      .description ( 'Gives a summary of the projects that laoban-admin has detected' )
      .action ( cmd => projects ( fileOps, directory, cmd ) ))
 // typeOptions (envs,program.command ( 'template-create' )
 //      .description ( 'Turns the current directory into a template. The parent directory name must have the word `template` in it' )
 //      .action ( cmd => createTemplates ( fileOps, directory, cmd ) ))


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