import { findLaoban, ProjectDetailFiles } from "./Files";
import * as fs from "fs";
import * as fse from "fs-extra";
import { abortWithReportIfAnyIssues, loadConfigOrIssues, loadLoabanJsonAndValidate, MakeCacheFnFromLaobanDir } from "./configProcessor";
import { Action, Config, ConfigAndIssues, ConfigOrReportIssues, ConfigWithDebug, ProjectAction, ProjectDetailsAndDirectory, ScriptDetails, ScriptInContext, ScriptInContextAndDirectory, ScriptInContextAndDirectoryWithoutStream } from "./config";
import * as path from "path";
import { findProfilesFromString, loadProfile, prettyPrintProfileData, prettyPrintProfiles } from "./profiling";
import { loadVersionFile } from "./modifyPackageJson";
import { compactStatus, DirectoryAndCompactedStatusMap, prettyPrintData, toPrettyPrintData, toStatusDetails, writeCompactedStatus } from "./status";
import * as os from "os";
import { execInSpawn, execJS, executeAllGenerations, ExecuteCommand, ExecuteGenerations, executeOneGeneration, ExecuteOneGeneration, executeScript, ExecuteScript, Generations, make, streamName, timeIt } from "./executors";
import { output, Strings } from "./utils";
import { validateProjectDetailsAndTemplates } from "./validation";
import { AppendToFileIf, CommandDecorators, GenerationDecorators, GenerationsDecorators, ScriptDecorators } from "./decorators";
import { shellReporter } from "./report";
import { Writable } from "stream";
import { CommanderStatic } from "commander";
import { addDebug } from "@laoban/debug";
import { FileOps, fileOpsStats, safeObject } from "@laoban/utils";
import { copyTemplateDirectory, updateConfigFilesFromTemplates } from "./update";


const displayError = ( outputStream: Writable ) => ( e: Error ) => {
  outputStream.write ( (e.message ? e.message : e.toString ()).split ( '\n' ).slice ( 0, 2 ).join ( '\n' ) + "\n" );
}
export const makeSessionId = ( d: Date, suffix: any, params: string[] ) =>
  d.toISOString ().replace ( /:/g, '.' ) + '.' + [ suffix, params.slice ( 3 ).map ( s => s.replace ( /[^[A-Za-z0-9._-]/g, '' ) ) ].join ( '.' );

function openStream ( sc: ScriptInContextAndDirectoryWithoutStream ): ScriptInContextAndDirectory {
  let logStream = fs.createWriteStream ( streamName ( sc ) );
  return { ...sc, logStream, streams: [ logStream ] }
}
function makeSc ( config: ConfigWithDebug, sessionId: string, details: ProjectDetailsAndDirectory[], script: ScriptDetails, cmd: any ) {
  let sc: ScriptInContext = {
    debug: config.debug,
    sessionId,
    dirWidth: Strings.maxLength ( details.map ( d => d.directory ) ) - config.laobanDirectory.length,
    dryrun: cmd.dryrun, variables: cmd.variables, shell: cmd.shellDebug, quiet: cmd.quiet, links: cmd.links, throttle: cmd.throttle,
    config, details: script, timestamp: new Date (), genPlan: cmd.generationPlan,
    context: { shellDebug: cmd.shellDebug, directories: details }
  }
  return sc;
}
function checkGuard ( config: ConfigWithDebug, script: ScriptDetails ): Promise<void> {
  let s = config.debug ( 'scripts' )
  s.message ( () => [ 'osGuard', os.type (), script.osGuard, 'pmGuard', config.packageManager, script.pmGuard ] )
  const makeErrorPromise = ( error: string ) => Promise.reject ( script.guardReason ? error + "\n" + script.guardReason : error )
  if ( script.osGuard && !os.type ().match ( script.osGuard ) )
    return makeErrorPromise ( `os is  ${os.type ()}, and this command has an osGuard of  [${script.osGuard}]` )
  if ( script.pmGuard && !config.packageManager.match ( script.pmGuard ) )
    return makeErrorPromise ( `Package Manager is ${config.packageManager} and this command has an pmGuard of  [${script.pmGuard}]` )
  return Promise.resolve ()
}


let configAction: Action<void> = ( fileOps: FileOps, config: Config, cmd: any ) => {
  let simpleConfig = { ...config }
  delete simpleConfig.scripts
  delete simpleConfig.outputStream
  output ( config ) ( JSON.stringify ( simpleConfig, null, 2 ) )
  return Promise.resolve ()
}
let clearCacheAction: Action<void> = ( fileOps: FileOps, config: Config, cmd: any ) => {
  if ( config.cacheDir )
    return fileOps.removeDirectory ( config.cacheDir, true )
  else
    console.log ( 'Cache directory is not defined in laoban.json' )
}

let statusAction: ProjectAction<void> = ( config: Config, cmd: any, pds: ProjectDetailsAndDirectory[] ) => {
  let compactedStatusMap: DirectoryAndCompactedStatusMap[] =
        pds.map ( d => ({ directory: d.directory, compactedStatusMap: compactStatus ( path.join ( d.directory, config.status ) ) }) )
  let prettyPrintStatusData = toPrettyPrintData ( toStatusDetails ( compactedStatusMap ) );
  prettyPrintData ( prettyPrintStatusData )
  return Promise.resolve ()
}

let compactStatusAction: ProjectAction<void[]> = ( config: Config, cmd: any, pds: ProjectDetailsAndDirectory[] ) =>
  Promise.all ( pds.map ( d =>
    writeCompactedStatus ( path.join ( d.directory, config.status ), compactStatus ( path.join ( d.directory, config.status ) ) ) ) )

const profileAction: ProjectAction<void> = ( config: Config, cmd: any, pds: ProjectDetailsAndDirectory[] ) =>
  Promise.all ( pds.map ( d => loadProfile ( config, d.directory ).then ( p => ({ directory: d.directory, profile: findProfilesFromString ( p ) }) ) ) ).//
    then ( p => {
      let data = prettyPrintProfileData ( p );
      prettyPrintProfiles ( output ( config ), 'latest', data, p => (p.latest / 1000).toFixed ( 3 ) )
      output ( config ) ( '' )
      prettyPrintProfiles ( output ( config ), 'average', data, p => (p.average / 1000).toFixed ( 3 ) )
    } )

const validationAction = ( fileOps: FileOps, params: string[] ): Action<Config | void> =>
  ( fileOps: FileOps, config: ConfigWithDebug, cmd: any ) => ProjectDetailFiles.workOutProjectDetails ( fileOps, config, cmd )
    .then ( ds => validateProjectDetailsAndTemplates ( fileOps, config, ds ) )
    .then ( issues => abortWithReportIfAnyIssues ( { config, outputStream: config.outputStream, issues, params, fileOps } ), displayError ( config.outputStream ) )

//TODO This looks like it needs a clean up. It has abort logic and display error logic.


let projectsAction: Action<void> = ( fileOps: FileOps, config: ConfigWithDebug, cmd: any ) => {
  return ProjectDetailFiles.workOutProjectDetails ( fileOps, config, { ...cmd, all: true } ).//
    then ( pds => {
      let dirWidth = Strings.maxLength ( pds.map ( p => p.directory ) )
      let projWidth = Strings.maxLength ( pds.map ( p => p.projectDetails.name ) )
      let templateWidth = Strings.maxLength ( pds.map ( p => p.projectDetails.template ) )

      pds.forEach ( p => {
        let links = p.projectDetails.details.links;
        let dependsOn = (links && links.length > 0) ? ` depends on [${links.join ()}]` : ""
        output ( config ) ( `${p.directory.padEnd ( dirWidth )} => ${p.projectDetails.name.padEnd ( projWidth )} (${p.projectDetails.template.padEnd ( templateWidth )})${dependsOn}` )
      } )
    } )
    .catch ( displayError ( config.outputStream ) )
}


function postCommand ( p: any, fileOps: FileOps ) {
  return res => {
    if ( p.cachestats ) console.log ( `Cache stats ${JSON.stringify ( fileOpsStats ( fileOps ), null, 2 )}\n` )
    return res
  };
}

function extraUpdateOptions ( program: CommanderStatic ) {
  program.option ( '--setVersion <version>', 'sets the version' )
  program.option ( '-m,--minor', 'update minor version' )
  program.option ( '--major', 'update major version' )
  return program
}
export class Cli {
  private program: any;
  private params: string[]

  defaultOptions ( configAndIssues: ConfigAndIssues ): ( program: CommanderStatic ) => any {
    return program => {
      let defaultThrottle = configAndIssues.config ? configAndIssues.config.throttle : 0
      return program.//
        option ( '-d, --dryrun', 'displays the command instead of executing it', false ).//
        option ( '-s, --shellDebug', 'debugging around the shell', false ).//
        option ( '-q, --quiet', "don't display the output from the commands", false ).//
        option ( '-v, --variables', "used when debugging scripts. Shows the variables available to a command when the command is executed", false ).//
        option ( '-1, --one', "executes in this project directory (opposite of --all)", false ).//
        option ( '-a, --all', "executes this in all projects, even if 'ín' a project", false ).//
        option ( '-p, --projects <projects>', "executes this in the projects matching the regex. e.g. -p 'name'", "" ).//
        option ( '-g, --generationPlan', "instead of executing shows the generation plan", false ).//
        option ( '-t, --throttle <throttle>', "only this number of scripts will be executed in parallel", defaultThrottle.toString () ).//
        option ( '-l, --links', "the scripts will be put into generations based on links (doesn't work properly yet if validation errors)", false ).//
        option ( '--debug <debug>', "enables debugging. debug is a comma separated list.legal values include [session,update,link,guard,templates]" ).//
        option ( '--sessionId <sessionId>', "specifies the session id, which is mainly used for logging" )
    }
  }

  minimalOptions ( configAndIssues: ConfigAndIssues ): ( program: CommanderStatic ) => any {
    return program => program
      .option ( '--debug <debug>', "enables debugging. debug is a comma separated list.legal values include [session,update,link]" )
  }


  constructor ( configAndIssues: ConfigAndIssues, executeGenerations: ExecuteGenerations, configOrReportIssues: ConfigOrReportIssues ) {
    const version = require ( "../../package.json" ).version
    const fileOps = configAndIssues.fileOps
    this.params = configAndIssues.params
    var program = require ( 'commander' )
      .arguments ( '' )
      .option ( '-c, --cachestats', "show how the cache was impacted by this command", false )
      .option ( '--load.laoban.debug' ).version ( version )//

    let defaultOptions = this.defaultOptions ( configAndIssues )
    function command ( program: any, cmd: string, description: string, fns: (( a: any ) => any)[] ) {
      let p = program.command ( cmd ).description ( description )
      fns.forEach ( fn => p = fn ( p ) )
      return p
    }
    function action<T> ( p: any, name: string, a: Action<T>, description: string, ...options: (( p: any ) => any)[] ) {
      return command ( p, name, description, options )
        .action ( cmd => configOrReportIssues ( configAndIssues ).then ( addDebug ( cmd.debug, x => console.log ( '#', ...x ) ) )
          .then ( ( configWithDebug: ConfigWithDebug ) =>
            a ( fileOps, configWithDebug, cmd )
              .then ( postCommand ( p, fileOps ) )
              .catch ( displayError ( configWithDebug.outputStream ) ) ) )
    }
    function projectAction<T> ( p: any, name: string, a: ProjectAction<T>, description: string, ...options: (( p: any ) => any)[] ) {
      return action ( p, name, ( fileOps: FileOps, config: ConfigWithDebug, cmd: any ) =>
        ProjectDetailFiles.workOutProjectDetails ( fileOps, config, cmd )
          .then ( pds => a ( config, cmd, pds ) )
          .catch ( displayError ( config.outputStream ) ), description, ...options )
    }

    function scriptAction<T> ( p: any, name: string, description: string, scriptFn: () => ScriptDetails, fn: ( gens: Generations ) => Promise<T>, ...options: (( p: any ) => any)[] ) {
      return projectAction ( p, name, ( config: ConfigWithDebug, cmd: any, pds: ProjectDetailsAndDirectory[] ) => {
        let script = scriptFn ()
        let sessionId = cmd.sessionId ? cmd.sessionId : makeSessionId ( new Date (), script.name, configAndIssues.params );
        let sessionDir = path.join ( config.sessionDir, sessionId );
        config.debug ( 'session' ).message ( () => [ 'sessionId', sessionId, 'sessionDir', sessionDir ] )
        return checkGuard ( config, script ).then ( () => fse.mkdirp ( sessionDir ).then ( () => {
          let scds: ScriptInContextAndDirectory[] = pds.map ( d => openStream ( { detailsAndDirectory: d, scriptInContext: makeSc ( config, sessionId, pds, script, cmd ) } ) )
          let s = config.debug ( 'scripts' );
          s.message ( () => [ 'rawScriptCommands', ...script.commands.map ( s => s.command ) ] )
          s.message ( () => [ 'directories', ...scds.map ( s => s.detailsAndDirectory.directory ) ] )
          return fn ( [ scds ] )
        } ) )
      }, description, ...options )
    }

    action ( program, 'config', configAction, 'displays the config', this.minimalOptions ( configAndIssues ) )
    action ( program, 'clearCache', clearCacheAction, 'Clears the cache', this.minimalOptions ( configAndIssues ) )
    action ( program, 'validate', validationAction ( fileOps, this.params ), 'checks the laoban.json and the project.details.json', defaultOptions )
    scriptAction ( program, 'run', 'runs an arbitary command (the rest of the command line).', () => ({
      name: 'run', description: 'runs an arbitary command (the rest of the command line).',
      commands: [ { name: 'run', command: program.args.slice ( 1 ).filter ( n => !n.startsWith ( '-' ) ).join ( ' ' ), status: false } ]
    }), executeGenerations, defaultOptions )

    projectAction ( program, 'status', statusAction, 'shows the status of the project in the current directory', defaultOptions )
    projectAction ( program, 'compactStatus', compactStatusAction, 'crunches the status', defaultOptions )
    projectAction ( program, 'profile', profileAction, 'shows the time taken by named steps of commands', defaultOptions )
    action ( program, 'projects', projectsAction, 'lists the projects under the laoban directory', this.minimalOptions ( configAndIssues ) )

    projectAction ( program, 'update', updateConfigFilesFromTemplates ( fileOps ),
      "overwrites the package.json based on the project.details.json, and copies other template files overwrite project's",
      extraUpdateOptions, defaultOptions )


    if ( configAndIssues.issues.length == 0 )
      configAndIssues.config.scripts.forEach ( script => scriptAction ( program, script.name, script.description, () => script, executeGenerations, defaultOptions ) )

    program.on ( '--help', () => {
      let log = output ( configAndIssues )
      log ( '' );
      log ( 'Notes' );
      log ( "  If you are 'in' a project (the current directory has a project.details.json') then commands are executed by default just for the current project " );
      log ( "     but if you are not 'in' a project, the commands are executed for all projects" );
      log ( '  You can ask for help for a command by "laoban <cmd> --help"' );
      log ( '  To configure and setup laoban the "laoban-admin" tool can be loaded using "npm i -g laoban-admin"' );
      log ( '' );
      log ( 'Common command options (not every command)' );
      log ( '  -a    do it in all projects (default is to execute the command in the current project' );
      log ( '  -d    do a dryrun and only print what would be executed, rather than executing it' );
      log ( '' )
      if ( configAndIssues.issues.length > 0 ) {
        log ( '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' )
        log ( `There are issues preventing the program working. Type 'laoban validate' for details` )
        log ( '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' )
      }
    } );
    program.on ( 'command:*',
      function () {
        output ( configAndIssues ) ( `Invalid command: ${program.args.join ( ' ' )}\nSee --help for a list of available commands.` );
        abortWithReportIfAnyIssues ( configAndIssues )
        process.exit ( 1 );
      }
    );
    program.allowUnknownOption ( false );
    this.program = program
  }


  parsed: any;

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

export function defaultExecutor ( a: AppendToFileIf ) { return make ( execInSpawn, execJS, timeIt, CommandDecorators.normalDecorator ( a ) )}
let appendToFiles: AppendToFileIf = ( condition, name, contentGenerator ) =>
  condition ? fse.appendFile ( name, contentGenerator () ) : Promise.resolve ()

let executeOne: ExecuteCommand = defaultExecutor ( appendToFiles )
let executeOneScript: ExecuteScript = ScriptDecorators.normalDecorators () ( executeScript ( executeOne ) )
let executeGeneration: ExecuteOneGeneration = GenerationDecorators.normalDecorators () ( executeOneGeneration ( executeOneScript ) )

export function executeGenerations ( outputStream: Writable ): ExecuteGenerations {
  return GenerationsDecorators.normalDecorators () ( executeAllGenerations ( executeGeneration, shellReporter ( outputStream ) ) )
}

const loadLaobanAndIssues = ( fileOps: FileOps, makeCacheFn: MakeCacheFnFromLaobanDir ) => async ( dir: string, params: string[], outputStream: Writable ): Promise<ConfigAndIssues> => {
  try {
    const debug = params.includes ( '--load.laoban.debug' )
    const laoban = findLaoban ( process.cwd () )
    if ( debug ) console.log ( `Found laoban.json at ${laoban}\n` )
    return loadConfigOrIssues ( outputStream, params, loadLoabanJsonAndValidate ( fileOps, makeCacheFn ( laoban ), debug ), debug ) ( laoban );
  } catch ( e ) {
    return {
      outputStream,
      params,
      fileOps,
      issues: [ `Error while starting  ${e.message}` ]
    }
  }

};
export async function makeStandardCli ( fileOps: FileOps, makeCacheFn: MakeCacheFnFromLaobanDir, outputStream: Writable, params: string[] ) {
  const configAndIssues: ConfigAndIssues = await loadLaobanAndIssues ( fileOps, makeCacheFn ) ( process.cwd (), params, outputStream )
  // console.log('makeStandardCli', configAndIssues.config)
  return new Cli ( configAndIssues, executeGenerations ( outputStream ), abortWithReportIfAnyIssues );
}
