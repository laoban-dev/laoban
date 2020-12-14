import {copyTemplateDirectory, findLaoban, ProjectDetailFiles} from "./Files";
import * as fs from "fs";
import * as fse from "fs-extra";
import {abortWithReportIfAnyIssues, loadConfigOrIssues, loadLoabanJsonAndValidate} from "./configProcessor";
import {
    Action,
    Config,
    ConfigAndIssues,
    ConfigOrReportIssues,
    ProjectDetailsAndDirectory,
    ScriptDetails,
    ScriptInContext,
    ScriptInContextAndDirectory,
    ScriptInContextAndDirectoryWithoutStream
} from "./config";
import * as path from "path";
import {findProfilesFromString, loadProfile, prettyPrintProfileData, prettyPrintProfiles} from "./profiling";
import {loadPackageJsonInTemplateDirectory, loadVersionFile, modifyPackageJson, saveProjectJsonFile} from "./modifyPackageJson";
import {compactStatus, DirectoryAndCompactedStatusMap, prettyPrintData, toPrettyPrintData, toStatusDetails, writeCompactedStatus} from "./status";
import * as os from "os";
import {
    execInSpawn,
    execJS,
    executeAllGenerations,
    ExecuteCommand,
    ExecuteGenerations,
    executeOneGeneration,
    ExecuteOneGeneration,
    executeScript,
    ExecuteScript,
    Generation,
    Generations,
    GenerationsResult,
    make,
    streamName,
    streamNamefn,
    timeIt
} from "./executors";
import {output, Strings} from "./utils";
import {monitor, Status} from "./monitor";
import {validateProjectDetailsAndTemplates} from "./validation";
import {AppendToFileIf, CommandDecorators, GenerationDecorators, GenerationsDecorators, ScriptDecorators} from "./decorators";
import {shellReporter} from "./report";
import {Writable} from "stream";
import {Debug} from "./debug";
import {CommanderStatic} from "commander";

const displayError = (outputStream: Writable) => (e: Error) =>
    outputStream.write(e.message.split('\n').slice(0, 2).join('\n') + "\n");

const makeSessionId = (d: Date, suffix: any) => d.toISOString().replace(/:/g, '.') + '.' + suffix;

function openStream(sc: ScriptInContextAndDirectoryWithoutStream): ScriptInContextAndDirectory {
    let logStream = fs.createWriteStream(streamName(sc));
    return {...sc, logStream, streams: [logStream]}
}
function makeSc(config: Config, sessionId: string, details: ProjectDetailsAndDirectory[], script: ScriptDetails, debug: Debug, cmd: any) {
    let status = new Status(config, dir => streamNamefn(config.sessionDir, sessionId, sc.details.name, dir))
    let allDirectorys = details.map(d => d.directory)
    let sc: ScriptInContext = {
        debug,
        sessionId,
        status,
        dirWidth: Strings.maxLength(allDirectorys) - config.laobanDirectory.length,
        dryrun: cmd.dryrun, variables: cmd.variables, shell: cmd.shellDebug, quiet: cmd.quiet, links: cmd.links, throttle: cmd.throttle,
        config, details: script, timestamp: new Date(), genPlan: cmd.generationPlan,
        context: {shellDebug: cmd.shellDebug, directories: details}
    }
    return sc;
}
function checkGuard(config: Config, script: ScriptDetails): Promise<void> {
    const makeErrorPromise = (error: string) => Promise.reject(script.guardReason ? error + "\n" + script.guardReason : error)
    if (script.osGuard && !os.type().match(script.osGuard))
        return makeErrorPromise(`os is  ${os.type()}, and this command has an osGuard of  [${script.osGuard}]`)
    if (script.pmGuard && !config.packageManager.match(script.pmGuard))
        return makeErrorPromise(`Package Manager is ${config.packageManager} and this command has an pmGuard of  [${script.pmGuard}]`)
    return Promise.resolve()
}


let configAction: Action<void> = (config: Config, cmd: any) => {
    let simpleConfig = {...config}
    delete simpleConfig.scripts
    delete simpleConfig.outputStream
    return Promise.resolve(output(config)(JSON.stringify(simpleConfig, null, 2)))
}

//TODO sort out type signature.. and it's just messy
function runAction(executeCommand: any, command: () => string, executeGenerations: ExecuteGenerations): Action<GenerationsResult> {
    return (config: Config, cmd: any) => {
        // console.log('runAction', command())
        let s: ScriptDetails = {name: '', description: `run ${command}`, commands: [{name: 'run', command: command(), status: false}]}
        // console.log('command.run', command)
        return executeCommand(config, s, executeGenerations)(config, cmd)
    }
}


    let statusAction: Action<void> = (config: Config, cmd: any) => {
        return ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => {
            let compactedStatusMap: DirectoryAndCompactedStatusMap[] =
                ds.map(d => ({directory: d.directory, compactedStatusMap: compactStatus(path.join(d.directory, config.status))}))
            let prettyPrintStatusData = toPrettyPrintData(toStatusDetails(compactedStatusMap));
            prettyPrintData(prettyPrintStatusData)
        })
    }
let remoteLinkAction: Action<void> = (config: Config, cmd: any) => {
    let debug = new Debug(cmd.debug, x => console.log(x))
    return ProjectDetailFiles.workOutProjectDetails(config, {all: true}).then(ds => {
        debug.debug('link', () => 'linking ' + ds.map(d => d.directory).join())
        ds.forEach(pd => {
            debug.debug('link', () => `    ${config.packageManager} link in ${pd.directory}`)
        })
        return ds.forEach(pd => {
            let pdLinks = pd.projectDetails.details.links
            let links = pdLinks?pdLinks:[]
            return links.forEach(link =>
                console.log(`   ${config.packageManager} link ${link} in ${pd.directory}`)
            )
        })
    })
}


let compactStatusAction: Action<void> = (config: Config, cmd: any) =>
    ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds =>
        ds.forEach(d => writeCompactedStatus(path.join(d.directory, config.status), compactStatus(path.join(d.directory, config.status)))))

let profileAction: Action<void> = (config: Config, cmd: any) =>
    ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => Promise.all(ds.map(d =>
        loadProfile(config, d.directory).then(p => ({directory: d.directory, profile: findProfilesFromString(p)}))))).then(p => {
        let data = prettyPrintProfileData(p);
        prettyPrintProfiles(output(config), 'latest', data, p => (p.latest / 1000).toFixed(3))
        output(config)('')
        prettyPrintProfiles(output(config), 'average', data, p => (p.average / 1000).toFixed(3))
    })

let validationAction: Action<boolean | Config> = (config: Config, cmd: any) =>
    ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => validateProjectDetailsAndTemplates(config, ds)).//
        then(issues => abortWithReportIfAnyIssues({config, outputStream: config.outputStream, issues}), displayError(config.outputStream))
//TODO This looks like it needs a clean up. It has abort logic and display error logic. the signature sucks...


let projectsAction: Action<void[]> = (config: Config, cmd: any) => {

    return ProjectDetailFiles.workOutProjectDetails(config, {all: true}).//
        then(ds => {
            // console.log('details are', ds.map(s => s.directory))
            return Promise.all(ds.map(p => {
                // console.log('project', p.directory                )
                output(config)(p.directory)
            }))
        })

}
let updateConfigFilesFromTemplates: Action<void> = (config: Config, cmd: any) => {
    let debug = new Debug(cmd.debug, x => console.log(x))
    return ProjectDetailFiles.workOutProjectDetails(config, cmd).then(ds => ds.forEach(p => {
        debug.debug('update', () => `updating in ${p.directory}. Template is ${p.projectDetails.template}`)
        copyTemplateDirectory(config, debug, p.projectDetails.template, p.directory).then(() => {
            debug.debug('update', () => '    copyTemplateDirectory')
            loadPackageJsonInTemplateDirectory(config, debug, p.projectDetails).then(raw => {
                debug.debug('update', () => '  loaded template')
                return loadVersionFile(config).//
                    then(version => {
                        debug.debug('update', () => `  version is ${version}`)
                        return saveProjectJsonFile(debug, p.directory, modifyPackageJson(raw, version, p.projectDetails))
                    })
            })
        }, error => {
            console.error(`failed to copy template directory for ${p.projectDetails.name}`, error)
        })
    }))
}

// function command<T>(p: commander.CconfigOrReportIssues: ConfigOrReportIssues, configAndIssues: ConfigAndIssues) => (cmd: string,a: Action<T>, description: string, ...fns: ((a: any) => any)[]) {
//     function action<T>(a: Action<T>): (cmd: any) => Promise<T> {
//         return cmd => configOrReportIssues(configAndIssues).then(config => a(config, cmd))
//     }
//     var p = this.program.command(cmd).description(description)
//     fns.forEach(fn => p = fn(p))
//     return p.action(action(a))
// }

export class Cli {
    private program: any;

    defaultOptions(configAndIssues: ConfigAndIssues): (program: CommanderStatic) => any {
        return program => {
            let defaultThrottle = configAndIssues.config ? configAndIssues.config.throttle : 0
            return program.//
                option('-d, --dryrun', 'displays the command instead of executing it', false).//
                option('-s, --shellDebug', 'debugging around the shell', false).//
                option('-q, --quiet', "don't display the output from the commands", false).//
                option('-v, --variables', "used when debugging scripts. Shows the variables available to a command when the command is executed", false).//
                option('-1, --one', "executes in this project directory (opposite of --all)", false).//
                option('-a, --all', "executes this in all projects, even if 'ín' a project", false).//
                option('-p, --projects <projects>', "executes this in the projects matching the regex. e.g. -p 'name'", "").//
                option('-g, --generationPlan', "instead of executing shows the generation plan", false).//
                option('-t, --throttle <throttle>', "only this number of scripts will be executed in parallel", defaultThrottle.toString()).//
                option('-l, --links', "the scripts will be put into generations based on links (doesn't work properly yet if validation errors)", false).//
                option('--debug <debug>', "enables debugging. debug is a comma separated list.legal values include [session,update,link]").//
                option('--sessionId <sessionId>', "specifies the session id, which is mainly used for logging")
        }
    }


    executeCommand(config: Config, script: ScriptDetails, executeGenerations: ExecuteGenerations) {
        return (config: Config, cmd: any) => {
            let debug = new Debug(cmd.debug, s => console.log(s))
            let sessionId = cmd.sessionId ? cmd.sessionId : makeSessionId(new Date(), script.name);
            let sessionDir = path.join(config.sessionDir, sessionId);
            debug.debug('session', () => `cmd.session [${cmd.sessionId}] sessionId actually [${sessionId}]. SessionDir is [${sessionDir}]`)
            return checkGuard(config, script).then(() => fse.mkdirp(sessionDir).then(() =>
                ProjectDetailFiles.workOutProjectDetails(config, cmd).then(details => {
                    let sc = makeSc(config, sessionId, details, script, debug, cmd);
                    let scds: Generation = details.map(d => openStream({detailsAndDirectory: d, scriptInContext: sc}))
                    let gens: Generations = [scds]
                    let promiseGensResult: Promise<GenerationsResult> = executeGenerations(gens).catch(e => {
                        config.outputStream.write('had error in execution\n')
                        displayError(config.outputStream)(e)
                        return []
                    })
                    monitor(sc.status, promiseGensResult.then(() => {}))
                    return promiseGensResult
                })))
        }
    }


    constructor(configAndIssues: ConfigAndIssues, executeGenerations: ExecuteGenerations, configOrReportIssues: ConfigOrReportIssues) {
        var program = require('commander').//
            arguments('').//
            version('0.1.0')//

        let defaultOptions = this.defaultOptions(configAndIssues)
        function command(cmd: string, description: string, fns: ((a: any) => any)[]) {
            let p = program.command(cmd).description(description)
            fns.forEach(fn => p = fn(p))
            return p
        }
        function action<T>(name: string, a: Action<T>, description: string, ...options: ((p: any) => any)[]) {
            // console.log(name)
            command(name, description, options).action(cmd => configOrReportIssues(configAndIssues).then(config => a(config, cmd).catch(displayError(config.outputStream))))
        }
        let exCommand = this.executeCommand
        function addScripts(config: Config, ...options: ((program: any) => any)[]) {
            let scripts = config.scripts
            scripts.forEach(script => action(script.name, exCommand(config, script, executeGenerations), script.description, ...options))
        }

        action('config', configAction, 'displays the config', defaultOptions)
        action('run', runAction(exCommand, () => program.args.slice(1).filter(n => !n.startsWith('-')).join(' '), executeGenerations), 'runs an arbitary command (the rest of the command line).', defaultOptions)
        action('status', statusAction, 'shows the status of the project in the current directory', defaultOptions)
        action('compactStatus', compactStatusAction, 'crunches the status', defaultOptions)
        action('validate', validationAction, 'checks the laoban.json and the project.details.json', defaultOptions)
        action('profile', profileAction, 'shows the time taken by named steps of commands', defaultOptions)
        action('projects', projectsAction, 'lists the projects under the laoban directory')
        action('update', updateConfigFilesFromTemplates, "overwrites the package.json based on the project.details.json, and copies other template files overwrite project's", defaultOptions)
        action('remoteLink', remoteLinkAction, "does npm/yarn link ", defaultOptions)

        if (configAndIssues.issues.length == 0) addScripts(configAndIssues.config, defaultOptions)

        program.on('--help', () => {
            let log = output(configAndIssues)
            log('');
            log("Press ? while running for list of 'status' commands. S is the most useful")
            log('')
            log('Notes');
            log("  If you are 'in' a project (the current directory has a project.details.json') then commands are executed by default just for the current project ");
            log("     but if you are not 'in' a project, the commands are executed for all projects");
            log('  You can ask for help for a command by "laoban <cmd> --help"');
            log('');
            log('Common command options (not every command)');
            log('  -a    do it in all projects (default is to execute the command in the current project');
            log('  -d    do a dryrun and only print what would be executed, rather than executing it');
            log('')
            if (configAndIssues.issues.length > 0) {
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
                log(`There are issues preventing the program w. Type 'laoban validate' for details`)
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
            }
        });
        program.on('command:*',
            function () {
                output(configAndIssues)(`Invalid command: ${this.program.args.join(' ')}\nSee --help for a list of available commands.`);
                abortWithReportIfAnyIssues(configAndIssues)
                process.exit(1);
            }
        );
        program.allowUnknownOption(false);
        this.program = program
    }


    parsed: any;
    start(argv: string[]) {
        // console.log('starting', argv)
        if (argv.length == 2) {
            this.program.outputHelp();
            return Promise.resolve()
        }
        this.parsed = this.program.parseAsync(argv); // notice that we have to parse in a new statement.
        return this.parsed
    }
}

export function defaultExecutor(a: AppendToFileIf) { return make(execInSpawn, execJS, timeIt, CommandDecorators.normalDecorator(a))}
let appendToFiles: AppendToFileIf = (condition, name, contentGenerator) =>
    condition ? fse.appendFile(name, contentGenerator()) : Promise.resolve()

let executeOne: ExecuteCommand = defaultExecutor(appendToFiles)
let executeOneScript: ExecuteScript = ScriptDecorators.normalDecorators()(executeScript(executeOne))
let executeGeneration: ExecuteOneGeneration = GenerationDecorators.normalDecorators()(executeOneGeneration(executeOneScript))
export function executeGenerations(outputStream: Writable): ExecuteGenerations {
    return GenerationsDecorators.normalDecorators()(executeAllGenerations(executeGeneration, shellReporter(outputStream)))
}
export function makeStandardCli(outputStream: Writable) {
    let laoban = findLaoban(process.cwd())
    let configAndIssues = loadConfigOrIssues(outputStream, loadLoabanJsonAndValidate)(laoban);
    return new Cli(configAndIssues, executeGenerations(outputStream), abortWithReportIfAnyIssues);
}