import {AnyCliCommand, CliGroup, CliRoot, makeValidateCliModel, root} from "@laoban/clidsl"
import {addCliModelToCommander, makeCommanderCliAdapter} from "@laoban/commander"
import {laobanConfigCommands} from "@laoban/config_cli"
import {ErrorsOr, isErrors, makeErrorFromException, value} from "@laoban/errors"
import {dumpErrors} from "@laoban/observability"
import {NodeReadChannel, NodeRef, NodeWriteChannel} from "@laoban/observability_node"
import {laobanPackageCommands} from "@laoban/package_cli"
import {makeScriptCommands} from "@laoban/scripts_cli"
import {laobanUpdateCommand} from "@laoban/update_cli"

import {LaobanCliContext} from "./laoban.context"
import {LaobanDi} from "./laoban.di"

export type LaobanCliChild =
    CliGroup<LaobanCliContext> |
    AnyCliCommand<LaobanCliContext>

export type RunLaobanAppOptions = Readonly<{
    exitOnCommanderError?: boolean
}>

export const builtInCliCommands: Record<string, LaobanCliChild> = {
    config: laobanConfigCommands,
    packages: laobanPackageCommands<NodeReadChannel, NodeWriteChannel, NodeRef>(),
    update: laobanUpdateCommand,
}

export function makeCliRoot(commands: Record<string, LaobanCliChild>): CliRoot<LaobanCliContext> {
    return root(
        "laoban",
        "a monorepo management tool",
        commands,
        "1.0.0",
    )
}

export function firstCommandToken(argv: string[]): string | undefined {
    const token = argv[2]
    return token && !token.startsWith("-") ? token : undefined
}

export function isBuiltInTopLevelCommand(
    commands: Record<string, LaobanCliChild>,
    argv: string[],
): boolean {
    const commandName = firstCommandToken(argv)

    return commandName !== undefined &&
        Object.prototype.hasOwnProperty.call(commands, commandName)
}

export async function makeLaobanCliModel(di: LaobanDi): Promise<ErrorsOr<CliRoot<LaobanCliContext>>> {
    const builtInCliModel = makeCliRoot(builtInCliCommands)

    if (isBuiltInTopLevelCommand(builtInCliCommands, di.argv)) {
        return value(builtInCliModel)
    }

    const context = di.makeContext()

    const loadedConfig = await di.loadLaobanConfig(
        {
            osOps: context.osOps,
            fileOps: context.fileOps,
            observability: context.observability,
            markerFileName: "laoban.json",
            loadTextConfig: context.loadLaobanFileConfig,
        },
        context.cwd,
    )

    if (isErrors(loadedConfig)) {
        return loadedConfig
    }

    const scriptCommands = makeScriptCommands(
        loadedConfig.value.config.scripts ?? {},
    ) as Record<string, AnyCliCommand<LaobanCliContext>>

    return value(makeCliRoot({
        ...builtInCliCommands,
        ...scriptCommands,
    }))
}

export function commanderExitCode(e: unknown): number | undefined {
    if (typeof e !== "object" || e === null) return undefined

    const commanderError = e as {
        code?: string
        exitCode?: number
    }

    if (commanderError.code === "commander.helpDisplayed") {
        return commanderError.exitCode ?? 0
    }

    if (commanderError.code === "commander.help") {
        return commanderError.exitCode ?? 0
    }

    if (typeof commanderError.exitCode === "number") {
        return commanderError.exitCode
    }

    return undefined
}

export async function runLaobanApp(
    di: LaobanDi,
    options: RunLaobanAppOptions = {},
): Promise<number> {
    const context = di.makeContext()
    const exitOnCommanderError = options.exitOnCommanderError ?? true

    try {
        const cliModelOrErrors = await makeLaobanCliModel(di)
        if (isErrors(cliModelOrErrors)) {
            di.dumpErrors(context.observability, cliModelOrErrors)
            return 1
        }

        const cliModel = cliModelOrErrors.value

        const validation =
            makeValidateCliModel<LaobanCliContext>()([], context.observability)(cliModel)

        if (isErrors(validation)) {
            di.dumpErrors(context.observability, validation)
            return 1
        }

        const command = di.makeCommand()

        if (!exitOnCommanderError) {
            command.exitOverride()
        }

        addCliModelToCommander(
            command,
            cliModel,
            makeCommanderCliAdapter<LaobanCliContext>({
                observability: context.observability,
                makeContext: di.makeContext,
                onError: async (observability, e) => {
                    di.dumpErrors(observability, e)
                },
            }),
        )

        try {
            await command.parseAsync(di.argv)
            return 0
        } catch (e) {
            const exitCode = commanderExitCode(e)

            if (exitCode !== undefined) {
                return exitCode
            }

            throw e
        }
    } catch (e) {
        di.dumpErrors(context.observability, makeErrorFromException("running laoban app", e))
        return 1
    }
}