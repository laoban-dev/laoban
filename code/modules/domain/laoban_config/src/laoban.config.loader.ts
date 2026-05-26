import {mergeAll, MergeOptions} from "@laoban/merge"
import {
    errors,
    type ErrorsOr,
    type FileIssue,
    isErrors,
} from "@laoban/errors"
import {
    type DiagnosticContext,
    addDiagnosticContextToErrors,
} from "@laoban/errors/src/error.monad"
import {type DirectoryName, type Filename} from "@laoban/files"
import {normaliseRawLaobanScripts} from "@laoban/scripts"
import {OsOps} from "@laoban/os"

import type {
    LaobanConfig,
    LaobanConfigFile,
    LaobanConfigLoadConfig,
    LoadedLaobanConfig,
} from "./laoban.config"
import {
    validateConfigFileContents,
    validateLaobanConfig,
} from "./laoban.config.validator"

const defaultLaobanConfig = (osOps: OsOps): LaobanConfig => ({
    packageManager: "yarn",
    versionFile: "version.txt",
    parents: [],
    throttle: osOps.cpuCount(),
    properties: {},
    templates: {},
    defaultEnv: {},
    scripts: {},
    skipDirectories: [".git", "node_modules"],
})

function debug(
    config: LaobanConfigLoadConfig,
    area: string,
    diagnosticContext: DiagnosticContext,
    ...msg: unknown[]
): void {
    config.observability.debug([area], "debug", diagnosticContext, ...msg)
}

function initialDiagnosticContext(): DiagnosticContext {
    return {
        currentFile: "",
        loadPath: [],
    }
}

function withCurrentFile(
    diagnosticContext: DiagnosticContext,
    file: Filename,
): DiagnosticContext {
    return {
        currentFile: file,
        loadPath: [...(diagnosticContext.loadPath ?? []), file],
    }
}

function hasLoadedFile(
    diagnosticContext: DiagnosticContext,
    file: Filename,
): boolean {
    return diagnosticContext.loadPath?.includes(file) ?? false
}

function normaliseLaobanConfig(
    osOps: OsOps,
    config: LaobanConfigFile,
    mergeOptions?: MergeOptions,
): LaobanConfig {
    const merged = mergeAll(
        [defaultLaobanConfig(osOps), config],
        mergeOptions,
    ) as Omit<LaobanConfig, "scripts"> & {scripts: LaobanConfigFile["scripts"]}

    return {
        ...merged,
        scripts: normaliseRawLaobanScripts(merged.scripts ?? {}),
    }
}

function parseJson(
    text: string,
    diagnosticContext: DiagnosticContext,
): ErrorsOr<unknown, FileIssue> {
    try {
        return {value: JSON.parse(text)}
    } catch (e) {
        return errors<FileIssue>({
            kind: "parseJson",
            message: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
            diagnosticContext,
        })
    }
}

function joinFile(directory: DirectoryName, filename: Filename): Filename {
    if (directory.endsWith("/")) return `${directory}${filename}` as Filename
    return `${directory}/${filename}` as Filename
}

async function findConfigFile(
    config: LaobanConfigLoadConfig,
    start: Filename | DirectoryName,
): Promise<ErrorsOr<{configDirectory: DirectoryName; configFile: Filename}, FileIssue>> {
    const diagnosticContext = initialDiagnosticContext()
    debug(config, "find", diagnosticContext, "finding config from", start)

    const containingDirectory = await config.fileOps.findContainingDirectory(
        start,
        config.markerFileName,
    )

    if (isErrors(containingDirectory)) {
        return addDiagnosticContextToErrors(containingDirectory, diagnosticContext)
    }

    const configDirectory = containingDirectory.value as DirectoryName
    const configFile = joinFile(configDirectory, config.markerFileName)

    return {
        value: {
            configDirectory,
            configFile,
        },
    }
}

export async function loadAndValidateOneConfigFile(
    config: LaobanConfigLoadConfig,
    file: Filename,
    diagnosticContext: DiagnosticContext,
): Promise<ErrorsOr<LaobanConfigFile, FileIssue>> {
    debug(config, "load", diagnosticContext, "loading config file")

    const textResult = await config.fileOps.loadText(file, config.loadTextConfig)

    if (isErrors(textResult)) {
        return addDiagnosticContextToErrors(textResult, diagnosticContext)
    }

    debug(config, "parse", diagnosticContext, "parsing config file")

    const parsed = parseJson(textResult.value, diagnosticContext)

    if (isErrors(parsed)) {
        return parsed
    }

    debug(config, "validate", diagnosticContext, "validating config file contents")

    const contentsValidation = validateConfigFileContents([], config.observability as any)(
        parsed.value as any,
    )

    if (isErrors(contentsValidation)) {
        return addDiagnosticContextToErrors(contentsValidation, diagnosticContext)
    }

    return {value: contentsValidation.value}
}

export async function loadConfigTreeFromFile(
    config: LaobanConfigLoadConfig,
    file: Filename,
    diagnosticContext: DiagnosticContext = initialDiagnosticContext(),
): Promise<ErrorsOr<{rawConfig: LaobanConfigFile; loadedFiles: Filename[]}, FileIssue>> {
    if (hasLoadedFile(diagnosticContext, file)) {
        const cyclePath = [...(diagnosticContext.loadPath ?? []), file]

        return errors<FileIssue>({
            kind: "configParentCycle",
            message: `Cycle detected loading laoban config: ${cyclePath.join(" -> ")}`,
            diagnosticContext: {
                currentFile: file,
                loadPath: cyclePath,
            },
        })
    }

    const currentDiagnosticContext = withCurrentFile(diagnosticContext, file)

    const oneFile = await loadAndValidateOneConfigFile(
        config,
        file,
        currentDiagnosticContext,
    )

    if (isErrors(oneFile)) return oneFile

    const raw = oneFile.value
    const parentFiles = raw.parents ?? []

    debug(config, "parents", currentDiagnosticContext, "loading parents for", parentFiles)

    const mergedConfigs: LaobanConfigFile[] = []
    const loadedFiles: Filename[] = []

    for (const parent of parentFiles) {
        const parentResult = await loadConfigTreeFromFile(
            config,
            parent as Filename,
            currentDiagnosticContext,
        )

        if (isErrors(parentResult)) return parentResult

        mergedConfigs.push(parentResult.value.rawConfig)
        loadedFiles.push(...parentResult.value.loadedFiles)
    }

    debug(config, "merge", currentDiagnosticContext, "merging config chain")

    const rawConfig = mergeAll(
        [...mergedConfigs, raw],
        config.mergeOptions,
    ) as LaobanConfigFile

    return {
        value: {
            rawConfig,
            loadedFiles: [...loadedFiles, file],
        },
    }
}

export type LoadConfigFn = typeof loadLaobanConfig

export async function loadLaobanConfig(
    config: LaobanConfigLoadConfig,
    start: Filename | DirectoryName,
): Promise<ErrorsOr<LoadedLaobanConfig, FileIssue>> {
    const found = await findConfigFile(config, start)

    if (isErrors(found)) return found

    const {configDirectory, configFile} = found.value

    const loadedTree = await loadConfigTreeFromFile(config, configFile)

    if (isErrors(loadedTree)) return loadedTree

    const normalised = normaliseLaobanConfig(
        config.osOps,
        loadedTree.value.rawConfig,
        config.mergeOptions,
    )

    const finalDiagnosticContext: DiagnosticContext = {
        currentFile: configFile,
        loadPath: loadedTree.value.loadedFiles,
    }

    debug(config, "validate", finalDiagnosticContext, "validating merged config")

    const validated = validateLaobanConfig([], config.observability as any)(normalised as any)

    if (isErrors(validated)) {
        return addDiagnosticContextToErrors(validated, finalDiagnosticContext)
    }

    return {
        value: {
            config: validated.value,
            configFile,
            configDirectory,
            loadedFiles: loadedTree.value.loadedFiles,
        },
    }
}