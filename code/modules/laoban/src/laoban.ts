//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import {PackageDetailFiles, packageDetailsFile} from "./Files";
import * as fse from "fs-extra";
import {abortWithReportIfAnyIssues, loadLaobanAndIssues, MakeCacheFnFromLaobanDir} from "./configProcessor";

import * as path from "path";
import {compactStatus, DirectoryAndCompactedStatusMap, prettyPrintData, toPrettyPrintData, toStatusDetails} from "./status";
import * as os from "os";
import {decorateExecutor, execFile, execInSpawn, execJS, executeAllGenerations, executeOneGeneration, executeScript, nameAndCommandExecutor, timeIt} from "./executors";
import {output, Strings} from "./utils";
import {AppendToFileIf, CommandDecorators, GenerationDecorators, GenerationsDecorators, ScriptDecorators} from "./decorators";
import {shellReporter} from "./report";
import {Writable} from "stream";
import {Command} from "commander";

import {updateConfigFilesFromTemplates} from "./update";
import {FileOps, FileOpsAndXml, Path} from "@laoban/fileops";
import {stringOrUndefinedAsString, toArray} from "@laoban/utils";
import {action, ActionParams, displayError, packageAction} from "@laoban/cli";
import {Action, Config, ConfigAndIssues, ConfigOrReportIssues, ConfigWithDebug, ExecuteCommand, ExecuteGenerations, ExecuteOneGeneration, ExecuteScript, Generations, PackageAction, PackageDetailsAndDirectory, ScriptDetails, scriptHasGuard, ScriptInContext, ScriptInContextAndDirectoryWithoutStream} from "@laoban/config";


export const makeSessionId = (d: Date, suffix: any, params: string[]) =>
    [d.toISOString().replace(/:/g, '_'), suffix, ...params.slice(3).map(s => s.replace(/[^[A-Za-z0-9._-]/g, ''))].join('_');

function makeSc(config: ConfigWithDebug, sessionId: string, details: PackageDetailsAndDirectory[], script: ScriptDetails, cmd: any) {
    const sc: ScriptInContext = {
        debug: config.debug,
        ignoreGuard: cmd.ignoreGuard,
        sessionId,
        dirWidth: Strings.maxLength(details.map(d => d.directory)) - config.laobanDirectory.length,
        dryrun: cmd.dryrun, variables: cmd.variables,
        shell: cmd.shellDebug, quiet: cmd.quiet,
        links: cmd.links, throttle: cmd.throttle,
        config,
        details: script, timestamp: new Date(), genPlan: cmd.generationPlan,
        context: {shellDebug: cmd.shellDebug, directories: details}
    }
    return sc;
}

function checkGuard(config: ConfigWithDebug, script: ScriptDetails): Promise<void> {
    let s = config.debug('scripts')
    s.message(() => ['osGuard', os.type(), script.osGuard, 'pmGuard', config.packageManager, script.pmGuard])
    const makeErrorPromise = (error: string) => Promise.reject(script.guardReason ? error + "\n" + script.guardReason : error)
    if (script.osGuard && !os.type().match(script.osGuard))
        return makeErrorPromise(`os is  ${os.type()}, and this command has an osGuard of  [${script.osGuard}]`)
    if (script.pmGuard && !config.packageManager.match(script.pmGuard))
        return makeErrorPromise(`Package Manager is ${config.packageManager} and this command has an pmGuard of  [${script.pmGuard}]`)
    return Promise.resolve()
}

let statusAction = (path: Path): PackageAction<void> => async (config: Config, cmd: any, pds: PackageDetailsAndDirectory[]) => {
    if (!config) return Promise.reject('No config')
    let compactedStatusMap: DirectoryAndCompactedStatusMap[] =
        pds.map(d => ({directory: d.directory, compactedStatusMap: compactStatus(path.join(d.directory, config.status))}))
    let prettyPrintStatusData = toPrettyPrintData(path, config.laobanDirectory, toStatusDetails(compactedStatusMap));
    prettyPrintData(prettyPrintStatusData)
    const hasError = compactedStatusMap.reduce((acc, d) => {
        const hasFalse = [...d.compactedStatusMap.values()].reduce((dacc, v) => dacc || v.includes(' false '), false);
        return acc || hasFalse
    }, false)
    if (hasError) {
        console.log('exit code 1')
        process.exit(1)
    }
}

let packagesAction: Action<void> = (fileOps: FileOps, config: ConfigWithDebug, cmd: any) => {
    return PackageDetailFiles.workOutPackageDetails(fileOps, config, {...cmd, all: true}).//
        then(pds => {
            const goodPds = pds.filter(pd => pd.packageDetails)
            const badPds = pds.filter(pd => !pd.packageDetails)
            if (badPds.length > 0) console.log(`Bad package.details.json for ${badPds.map(pd => pd.directory).join(', ')}`)
            let dirWidth = Strings.maxLength(goodPds.map(p => fileOps.relative(config.laobanDirectory, p.directory)))
            let projWidth = Strings.maxLength(goodPds.map(p => p.packageDetails.name))
            let templateWidth = Strings.maxLength(goodPds.map(p => p.packageDetails.template))
            goodPds.forEach(p => {
                let links = toArray(p.packageDetails.links);
                let dependsOn = (links && links.length > 0) ? ` depends on [${links.join()}]` : ""
                output(config)(`${fileOps.relative(config.laobanDirectory, p.directory).padEnd(dirWidth)} => ${stringOrUndefinedAsString(p.packageDetails.name).padEnd(projWidth)} (${stringOrUndefinedAsString(p.packageDetails.template).padEnd(templateWidth)})${dependsOn}`)
            })
        })
        .catch(displayError(config.outputStream))
}

function extraUpdateOptions(program: Command) {
    program.option('--setVersion <version>', 'sets the version')
    program.option('-m,--minor', 'update minor version')
    program.option('--major', 'update major version')
    program.option('--allowsamples', 'If a sample is defined in the template, and is not present, it will be created')
    return program
}


const ignoreGuardOption = (s: ScriptDetails) => (program: Command) => {
    if (scriptHasGuard(s)) program.option('--ignoreGuards', 'Runs the command ignoring any guards. This may give erratic behaviour!')
    return program
};

export class Cli {
    private program: any;
    private params: string[]


    defaultOptions(configAndIssues: ConfigAndIssues): (program: Command) => any {
        return program => {
            let defaultThrottle = configAndIssues.config ? configAndIssues.config.throttle : 0
            return program.//
                option('-d, --dryrun', 'displays the command instead of executing it', false).//
                option('-s, --shellDebug', 'debugging around the shell', false).//
                option('-q, --quiet', "don't display the output from the commands", false).//
                option('-v, --variables', "used when debugging scripts. Shows the variables available to a command when the command is executed", false).//
                option('-1, --one', "executes in this project directory (opposite of --all)", false).//
                option('-a, --all', "executes this in all projects, even if 'ín' a project", false).//
                option('-p, --packages <packages>', "executes this in the packages matching the regex. e.g. -p 'name'", "").//
                option('-g, --generationPlan', "instead of executing shows the generation plan", false).//
                option('-t, --throttle <throttle>', "only this number of scripts will be executed in parallel", defaultThrottle.toString()).//
                option('-l, --links', "the scripts will be put into generations based on links (doesn't work properly yet if validation errors)", false).//
                option('--debug <debug>', "enables debugging. <debug> is a space separated list. legal values include [session,update,link,guard,templates,files, scripts]").//
                option('--sessionId <sessionId>', "specifies the session id, which is mainly used for logging")
        }
    }

    minimalOptions(configAndIssues: ConfigAndIssues): (program: Command) => any {
        return program => program
            .option('--debug <debug>', "enables debugging. debug is a comma separated list.legal values include [session,update,link]")
    }

    configOptions(program: Command) {
        return program.option('--all', "Includes the scripts")
    }


    constructor(configAndIssues: ConfigAndIssues, executeGenerations: ExecuteGenerations, configOrReportIssues: ConfigOrReportIssues) {
        const version = require("../../package.json").version
        const fileOpsAndXml = configAndIssues.fileOpsAndXml
        const {fileOps} = fileOpsAndXml
        this.params = configAndIssues.params
        var program: Command = require('commander')
            .name('laoban')
            .usage('<command> [options]')
            .arguments('')
            .option('--load.laoban.debug').version(version)


        let defaultOptions = this.defaultOptions(configAndIssues)

        const actionParams: ActionParams = {
            program,
            configOrReportIssues,
            configAndIssues,
            fileOps
        }

        function scriptAction<T>(actionParams: ActionParams, name: string, description: string, scriptFn: () => ScriptDetails, fn: (gens: Generations) => Promise<T>, ...options: ((p: any) => any)[]) {
            const passThruArgs = scriptFn().passThruArgs;
            const nameWithVarargs = passThruArgs ? `${name} [passThruArgs...]` : name
            return packageAction(actionParams, nameWithVarargs, (config: ConfigWithDebug, cmd: any, pds: PackageDetailsAndDirectory[]) => {
                const badPds = pds.filter(p => !p.packageDetails)
                if (badPds.length > 0) console.log(`The following projects have errors in their project.details.json: ${badPds.map(p => p.directory).join()}`)
                const goodPds = pds.filter(p => p.packageDetails)
                let script = scriptFn()
                let sessionId = cmd.sessionId ? cmd.sessionId : makeSessionId(new Date(), script.name, configAndIssues.params);
                let sessionDir = path.join(config.sessionDir, sessionId);
                config.debug('session').message(() => ['sessionId', sessionId, 'sessionDir', sessionDir])
                return checkGuard(config, script).then(() => fse.mkdirp(sessionDir).then(async () => {
                    const scriptInContext = makeSc(config, sessionId, pds, script, cmd);
                    let scds: ScriptInContextAndDirectoryWithoutStream[] = goodPds.map(d => ({detailsAndDirectory: d, scriptInContext}))
                    let s = config.debug('scripts');

                    s.message(() => ['rawScriptCommands', ...script.commands.map(s => s.command)])
                    s.message(() => ['directories', ...scds.map(s => s.detailsAndDirectory.directory)])

                    return await fn([scds])
                }))
            }, description, ...options)
        }

        program.command('admin <command>', 'admin commands. For example cleaning/modifying the project (creating new packages, set up templates...')
        scriptAction(actionParams, 'run', 'runs an arbitary command (the rest of the command line).', () => ({
            name: 'run', description: 'runs an arbitrary command (the rest of the command line).',
            commands: [{name: 'run', command: program.args.slice(1).filter(n => !n.startsWith('-')).join(' '), status: false}]
        }), executeGenerations, defaultOptions)

        packageAction(actionParams, 'status', statusAction(fileOps), 'shows the initStatus of the project in the current directory', defaultOptions)
        action(actionParams, 'packages', packagesAction, 'lists the packages under the laoban directory', this.minimalOptions(configAndIssues))

        packageAction(actionParams, 'update', updateConfigFilesFromTemplates(fileOpsAndXml),
            `overwrites the package.json based on the ${packageDetailsFile}, and copies other template files overwrite project's`,
            extraUpdateOptions, defaultOptions)


        if (configAndIssues.issues.length == 0)
            (configAndIssues.config.scripts).sort((a, b) => a.name.localeCompare(b.name))
                .forEach(script => scriptAction(actionParams, script.name, script.description, () => script, executeGenerations, defaultOptions,
                    ignoreGuardOption(script)))

        program.on('--help', () => {
            let log = output(configAndIssues)
            log('');
            log('Notes');
            log(`  If you are 'in' a package (the current directory has a ${packageDetailsFile}') then commands are executed by default just for the current package `);
            log("     but if you are not 'in' a package, the commands are executed for all packages");
            log('  You can ask for help for a command by "laoban <cmd> --help"');
            log('');
            log('Common command options (not every command)');
            log('  -a    do it in all packages (default is to execute the command in the current project');
            log('  -d    do a dryrun and only print what would be executed, rather than executing it');
            log('')
            if (configAndIssues.issues.length > 0) {
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
                log(`There are issues preventing the program working. Type 'laoban admin validate' for details`)
                log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
            }
        });
        program.on('command:*',
            function () {
                output(configAndIssues)(`Invalid command: ${program.args.join(' ')}\nSee --help for a list of available commands.`);
                abortWithReportIfAnyIssues(configAndIssues)
                process.exit(1);
            }
        );
        program.allowUnknownOption(false);
        this.program = program
    }


    parsed: any;

    start() {
        // console.log('starting', argv)
        if (this.params.length == 2) {
            this.program.outputHelp();
            return Promise.resolve()
        }
        this.parsed = this.program.parseAsync(this.params); // notice that we have to parse in a new statement.
        return this.parsed
    }
}

const nameAndExecutors = (fileOps: FileOps) => nameAndCommandExecutor({
    js: execJS,
    file: execFile(fileOps)
}, execInSpawn)

export function defaultExecutor(a: AppendToFileIf, fileOps: FileOps) {
    return decorateExecutor(nameAndExecutors(fileOps), timeIt, CommandDecorators.normalDecorator(a))
}

let appendToFiles: AppendToFileIf = (condition, name, contentGenerator) =>
    condition ? fse.appendFile(name, contentGenerator()) : Promise.resolve()

let executeOne = (fileOps: FileOps): ExecuteCommand => defaultExecutor(appendToFiles, fileOps)
let executeOneScript = (fileOps: FileOps, outputStream: Writable): ExecuteScript => ScriptDecorators.normalDecorators()(executeScript(fileOps, outputStream, executeOne(fileOps)))
let executeGeneration = (fileOps: FileOps, outputStream: Writable): ExecuteOneGeneration => GenerationDecorators.normalDecorators()(executeOneGeneration(executeOneScript(fileOps, outputStream)))

export function executeGenerations(outputStream: Writable, fileOps: FileOps): ExecuteGenerations {
    return GenerationsDecorators.normalDecorators()(executeAllGenerations(executeGeneration(fileOps, outputStream), shellReporter(fileOps, outputStream)))
}

export async function makeStandardCli(fileOpsAndXml: FileOpsAndXml, makeCacheFn: MakeCacheFnFromLaobanDir, outputStream: Writable, params: string[]) {
    const configAndIssues: ConfigAndIssues = await loadLaobanAndIssues(fileOpsAndXml, makeCacheFn)(process.cwd(), params, outputStream)
    // console.log('makeStandardCli', configAndIssues.config)
    return new Cli(configAndIssues, executeGenerations(outputStream, fileOpsAndXml.fileOps), abortWithReportIfAnyIssues);
}
