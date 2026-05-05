import {jsonCodec} from "@laoban/codec"
import {
    ChannelsState,
    DebugConfig,
    defaultModuleObservabilityScope,
    defaultObservabilityTemplates,
    dumpErrors,
    emptyChannelState,
    ModuleObservabilityScope,
    parseDebugConfig,
    realTimeService
} from "@laoban/observability"
import {Command} from "commander"
import * as process from "node:process"

import {defaultLoadTextConfig, FileOpsHelperConfig} from "@laoban/files"
import {nodeFileOps, nodeFileOpsDefaults, nodeLoadTextInfrastructure} from "@laoban/files_node"
import {LaobanConfigLoadConfig, loadLaobanConfig} from "@laoban/laoban_config"
import {Env} from "@laoban/records"
import {createNodeObservability, nodeChannelTc, NodeReadChannel, NodeWriteChannel,} from "@laoban/observability_node"
import {loadConfigAndPackages} from "@laoban/package_cli"
import {loadConfig} from "@laoban/config_cli"
import {loadPackages} from "@laoban/package_details"
import {safePathSegment, safePrettyJson} from "@laoban/safe"
import {
    defaultHandleLaobanScript,
    makeScriptExecutionItemTemplateDictionary,
    Purpose,
    purposes,
} from "@laoban/scripts_cli"
import {LaobanCliContext} from "./laoban.context"
import {makeNodeExecution, NodeExecution, NodeExecutionOptions} from "@laoban/node_execution/src/node.execution"
import {defaultFileCommands} from "@laoban/node_execution"
import {defaultPrefixAndValueOptions} from "@laoban/execution"
import {ErrorsOr, mapErrorsOr} from "@laoban/errors"
import {nodeOsOps} from "@laoban/node_os"
import {OsOps} from "@laoban/os"
import {throttlePlan} from "@laoban/topologicalsort"
import {planManagedFiles, updateManagedFiles} from "@laoban/update"
import {loadNormalisedTemplate} from "@laoban/template_files"
import {defaultFileDefinitionFns} from "@laoban/file_operations"
import {
    colonPrefixedVarDefn,
    defaultTemplateEngine,
    dollarsBracesVarDefn,
    doubleAngleVarDefn,
    mustachesVarDefn,
} from "@laoban/template"

export type LaobanDi = {
    argv: string[]
    makeCommand: () => Command
    makeContext: () => LaobanCliContext
    loadLaobanConfig: typeof loadLaobanConfig
    dumpErrors: typeof dumpErrors
}

export type MakeLaobanDiOptions = Readonly<{
    argv?: string[]
    cwd?: string
    env?: Env
    stdout?: NodeWriteChannel
    stderr?: NodeWriteChannel
    now?: string
}>

export function makeReference(pathSafeNow: string) {
    return (moduleScope: ModuleObservabilityScope) => (purpose: Purpose): string => {
        const safeModuleName = moduleScope.module ?? "__root__"

        switch (purpose) {
            case "log":
                return `${moduleScope.directory}/.log`

            case "session":
                return `.session/${pathSafeNow}/${safeModuleName}.log`
        }
    }
}

export function makeChannelsState(
    pathSafeNow: string,
    onError: (e: unknown) => void,
): ChannelsState<Purpose, NodeReadChannel, NodeWriteChannel, string> {
    return emptyChannelState(
        nodeChannelTc({
            reference: makeReference(pathSafeNow),
            keyFrom: moduleScope => String(moduleScope.module ?? ""),
        }),
        purposes,
        error => onError(safePrettyJson(error)),
    )
}

export function makeLaobanDi(options: MakeLaobanDiOptions = {}): ErrorsOr<LaobanDi> {
    const argv = options.argv ?? process.argv
    const cwd = options.cwd ?? process.cwd()
    const env: Env = options.env ?? process.env
    const stdOut = options.stdout ?? process.stdout
    const stdErr = options.stderr ?? process.stderr
    const now = options.now ?? new Date().toISOString()
    const pathSafeNow = safePathSegment(now)
    const command = argv[2] ?? "root"
    const correlationId = `${pathSafeNow}/${safePathSegment(command)}`

    const onError = (e: unknown) => stdErr.write(`${String(e)}\n`)

    const reference = makeReference(pathSafeNow)

    const {observability} = createNodeObservability<Purpose>({
        channel: stdOut,
        purposes,
        onError,
        reference,
    })

    const channelsState = makeChannelsState(pathSafeNow, onError)

    const fileOps = nodeFileOps(nodeFileOpsDefaults)

    const loadLaobanFileConfig = defaultLoadTextConfig(
        {infrastructure: nodeLoadTextInfrastructure},
        {
            markers: {
                "@laoban@": "https://raw.githubusercontent.com/phil-rice/laoban/master/common",
            },
            observability,
        },
    )

    const defaultJsonCodec = jsonCodec()
    const nodeExecuteOptions: NodeExecutionOptions = {
        fileCommands: defaultFileCommands,
        prefixAndValueOptions: defaultPrefixAndValueOptions,
    }

    const execution: NodeExecution = makeNodeExecution(nodeExecuteOptions)
    const osOps: OsOps = nodeOsOps

    const laobanConfigLoadConfig: LaobanConfigLoadConfig = {
        fileOps,
        osOps,
        loadTextConfig: loadLaobanFileConfig,
        observability,
        markerFileName: "laoban.json",
    }

    const fileOpsHelperConfig: FileOpsHelperConfig = {
        observability,
        infrastructure: nodeFileOpsDefaults.findAllByNameUnder.infrastructure,
    }

    const defaultUpdateDebug = false
    const defaultUpdateDryRun = false
    const defaultUpdateThrottle = 5

    return mapErrorsOr(parseDebugConfig(command), (debugConfig: DebugConfig) => {
        const result: LaobanDi = {
            argv,
            makeCommand: () => new Command(),
            loadLaobanConfig,
            dumpErrors,

            makeContext: () => {
                const context: LaobanCliContext = {
                    correlationId,
                    osOps,
                    moduleScope: defaultModuleObservabilityScope(),
                    channelsState,
                    execution,
                    timeService: realTimeService,
                    env,
                    debugConfig,
                    dictionary: {},
                    observabilityTemplates: defaultObservabilityTemplates,
                    observability,
                    fileOps,
                    loadLaobanFileConfig,

                    cwd,
                    start: cwd,
                    loadLaobanConfig,
                    stdOut,

                    loadConfigFn: loadConfig,
                    loadPackagesFn: loadPackages,
                    loadConfigAndPackagesFn: loadConfigAndPackages,

                    handleLaobanScript: defaultHandleLaobanScript,
                    makeDictionary: makeScriptExecutionItemTemplateDictionary,

                    laobanConfigLoadConfig,
                    loadConfig: loadLaobanConfig,
                    loadPackages,

                    loadTextConfig: loadLaobanFileConfig,
                    jsonCodec: defaultJsonCodec,

                    codecs: {
                        json: defaultJsonCodec,
                    },
                    fns: defaultFileDefinitionFns(),
                    templateEngine: defaultTemplateEngine,
                    templateTypes: {
                        "${}": dollarsBracesVarDefn,
                        "{{}}": mustachesVarDefn,
                        ":": colonPrefixedVarDefn,
                        "<<>>": doubleAngleVarDefn,
                    },

                    fileOpsHelperConfig,
                    debug: defaultUpdateDebug,
                    dryRun: defaultUpdateDryRun,

                    loadTemplate: input =>
                        loadNormalisedTemplate(
                            context,
                            {
                                templates: input.loadedConfig.config.templates ?? {},
                                templateName: input.templateName,
                                requestedBy: `package ${input.loadedPackageDetail.contents.name}`,
                            },
                        ),

                    planTemplateFileOperation: input =>
                        context.fns[input.fileDef.type](
                            input.fileDef,
                            {
                                loadedConfig: input.loadedConfig,
                                loadedPackageDetail: input.loadedPackageDetail,
                                package: input.loadedPackageDetail.contents,
                                template: input.template,
                                fileName: input.fileName,
                                files: input.loadedPackageDetail.contents.files ?? {},
                            },
                            context,
                        ),

                    throttlePlan,
                    throttle: defaultUpdateThrottle,

                    consumeBatch: ({files}) =>
                        updateManagedFiles(
                            context,
                            files,
                        ),

                    planManagedFiles,
                    updateManagedFiles,
                }

                return context
            },
        }

        return result
    })
}