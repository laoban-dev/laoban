import type {ICodec} from "@laoban/codec"
import {
    type BaseIssue,
    errors,
    type ErrorsOr,
    flatMapBaseIssue,
    flatMapBaseIssueK,
    mapBaseIssue,
    sequenceArrayErrorsOr,
    sequenceArrayErrorsOrK,
    value,
} from "@laoban/errors"
import type {
    FileNameAndContent,
    Filename,
    FileOps,
    FileOpsHelperConfig,
    FileOrUrl,
    LoadTextConfig,
} from "@laoban/files"
import {mergeAll} from "@laoban/merge"
import type {Observability} from "@laoban/observability"
import {safeArray} from "@laoban/safe"

import {
    dollarsBracesVarDefn,
    TemplateEngine,
    VariableDefn,
} from "@laoban/template"

export type DefaultFileTypes = "text" | "json"
export type MergeableFileTypes = "json"

export type OneOrMany<T> = T | T[]

export type TemplateDefn<
    TemplateType extends string ,
> = Readonly<{
    as: TemplateType
}>

export type Templatable<
    TemplateType extends string ,
> = Readonly<{
    template: TemplateDefn<TemplateType>
}>

export type MaybeTemplatable<
    TemplateType extends string,
> =
    | Readonly<{template?: undefined}>
    | Templatable<TemplateType>

export type FileOpDefinition<
    TemplateType extends string,
> =
    MaybeTemplatable<TemplateType> &
    Readonly<{
        target: Filename

        /**
         * Defaults to true.
         *
         * true means the generated file is managed and may overwrite an existing target.
         * false means create-if-missing only.
         *
         * The operation checks this after generating the candidate file.
         */
        overwrite?: boolean
    }>

export type CopyFileOpDefinition<
    TemplateType extends string,
> =
    FileOpDefinition<TemplateType> &
    Readonly<{
        type: "copy"
        source: FileOrUrl

        /**
         * Carried through from normalised template declarations.
         * It does not affect execution.
         */
        deprecated?: boolean
    }>

export type MergeFileOpDefinition<
    FileTypes extends MergeableFileTypes ,
    TemplateType extends string,
> =
    FileOpDefinition<TemplateType> &
    Readonly<{
        type: "merge"
        source: OneOrMany<FileOrUrl>
        fileType: FileTypes

        /**
         * Carried through from normalised template declarations.
         * It does not affect execution.
         */
        deprecated?: boolean
    }>

export type FileOperationDefinition<
    MergeableTypes extends MergeableFileTypes ,
    TemplateType extends string,
> =
    | CopyFileOpDefinition<TemplateType>
    | MergeFileOpDefinition<MergeableTypes, TemplateType>

export type FileDefinitionFn<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    Definition extends FileOpDefinition<TemplateType>,
    TemplateType extends string,
> = (
    definition: Definition,
    dictionary: unknown,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
) => Promise<ErrorsOr<FileNameAndContent[], BaseIssue>>

export type AnyFileDefinitionFn<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
> = (
    definition: any,
    dictionary: unknown,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
) => Promise<ErrorsOr<FileNameAndContent[], BaseIssue>>

export type FileDefinitionFns<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
> = Record<string, AnyFileDefinitionFn<FileTypes, MergeableTypes, TemplateType>>

export type FileOperationFileOps = Pick<FileOps, "loadText">

export type FileOperationConfig<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
> = Readonly<{
    observability: Observability
    codecs: Record<MergeableTypes, ICodec<any>>
    fns: FileDefinitionFns<FileTypes, MergeableTypes, TemplateType>
    templateEngine: TemplateEngine
    templateTypes: Record<TemplateType, VariableDefn>
    fileOps: FileOperationFileOps
    loadTextConfig: LoadTextConfig
    fileOpsHelperConfig: FileOpsHelperConfig
}>

export type FileOperationIssueKind =
    | "unknownTemplateType"
    | "missingCodec"
    | "copyExpectedOneSource"
    | "mergeExpectedAtLeastOneSource"
    | "missingFileOpsHelperInfrastructure"

export type FileOperationIssueContext = Readonly<{
    type?: string
    fileType?: string
    source?: FileOrUrl
    target?: Filename
    templateAs?: string
    sourceCount?: number
}>

export type FileOperationIssue =
    BaseIssue<FileOperationIssueKind, FileOperationIssueContext>

export function makeFileOperationIssue(
    kind: FileOperationIssueKind,
    message: string,
    context: FileOperationIssueContext = {},
): FileOperationIssue {
    return {
        kind,
        message,
        context,
    }
}

export function overwrite<TemplateType extends string>(
    definition: FileOpDefinition<TemplateType>,
): boolean {
    return definition.overwrite ?? true
}

export function isTemplatable<TemplateType extends string>(
    definition: MaybeTemplatable<TemplateType>,
): definition is Templatable<TemplateType> {
    return definition.template !== undefined
}

function templateVariableDefn<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    definition: FileOpDefinition<TemplateType> & Templatable<TemplateType>,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): ErrorsOr<VariableDefn, BaseIssue> {
    const variableDefn = config.templateTypes[definition.template.as]

    if (variableDefn === undefined) {
        return errors(makeFileOperationIssue(
            "unknownTemplateType",
            `Unknown template type: ${definition.template.as}`,
            {
                target: definition.target,
                templateAs: definition.template.as,
            },
        ))
    }

    return value(variableDefn)
}

export function renderIfTemplated<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    text: string,
    definition: FileOpDefinition<TemplateType>,
    dictionary: unknown,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): ErrorsOr<string, BaseIssue> {
    if (!isTemplatable(definition)) return value(text)

    return flatMapBaseIssue(
        templateVariableDefn(definition, config),
        variableDefn =>
            config.templateEngine(
                text,
                dictionary,
                {variableDefn},
            ),
    )
}

export function renderTarget<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    definition: FileOpDefinition<TemplateType>,
    dictionary: unknown,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): ErrorsOr<Filename, BaseIssue> {
    return mapBaseIssue(
        config.templateEngine(
            definition.target,
            dictionary,
            {variableDefn: dollarsBracesVarDefn},
        ),
        rendered => rendered as Filename,
    )
}

function loadSourceTexts<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    source: OneOrMany<FileOrUrl>,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): Promise<ErrorsOr<string[], BaseIssue>> {
    return sequenceArrayErrorsOrK(
        safeArray(source).map(sourceFile =>
            config.fileOps.loadText(
                sourceFile,
                config.loadTextConfig,
            ) as Promise<ErrorsOr<string, BaseIssue>>,
        ),
    )
}

function exactlyOneSourceText(
    texts: string[],
    definition: {type: string; source?: OneOrMany<FileOrUrl>; target: Filename},
): ErrorsOr<string, BaseIssue> {
    if (texts.length !== 1) {
        return errors(makeFileOperationIssue(
            "copyExpectedOneSource",
            `Copy operation expected exactly one source text but received ${texts.length}`,
            {
                type: definition.type,
                source: Array.isArray(definition.source) ? undefined : definition.source,
                target: definition.target,
                sourceCount: texts.length,
            },
        ))
    }

    return value(texts[0])
}

function atLeastOneSourceText(
    texts: string[],
    definition: {type: string; target: Filename},
): ErrorsOr<string[], BaseIssue> {
    if (texts.length === 0) {
        return errors(makeFileOperationIssue(
            "mergeExpectedAtLeastOneSource",
            "Merge operation expected at least one source text",
            {
                type: definition.type,
                target: definition.target,
                sourceCount: texts.length,
            },
        ))
    }

    return value(texts)
}

function renderAndDecodeAll<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    codec: ICodec<any>,
    texts: string[],
    definition: FileOpDefinition<TemplateType>,
    dictionary: unknown,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): ErrorsOr<unknown[], BaseIssue> {
    return sequenceArrayErrorsOr(
        texts.map(text =>
            flatMapBaseIssue(
                renderIfTemplated(text, definition, dictionary, config),
                rendered => codec.decode(rendered, config.observability),
            ),
        ),
    )
}

function fileExists<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    filename: Filename,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): Promise<ErrorsOr<boolean, BaseIssue>> {
    const infrastructure = config.fileOpsHelperConfig.infrastructure

    if (infrastructure === undefined) {
        return Promise.resolve(errors(makeFileOperationIssue(
            "missingFileOpsHelperInfrastructure",
            "File operation config has no FileOps helper infrastructure",
            {
                target: filename,
            },
        )))
    }

    return infrastructure.fileExists(
        filename,
        config.fileOpsHelperConfig,
    ) as Promise<ErrorsOr<boolean, BaseIssue>>
}

function keepIfOverwriteAllowed<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    generated: FileNameAndContent,
    definition: FileOpDefinition<TemplateType>,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): Promise<ErrorsOr<FileNameAndContent[], BaseIssue>> {
    return flatMapBaseIssueK(
        value(generated),
        async file =>
            mapBaseIssue(
                await fileExists(file.filename, config),
                exists => {
                    if (!exists) return [file]
                    return overwrite(definition) ? [file] : []
                },
            ),
    )
}

export async function copyFileDefinitionFn<
    FileTypes extends string,
    MergeableTypes extends FileTypes,
    TemplateType extends string,
>(
    definition: CopyFileOpDefinition<TemplateType>,
    dictionary: unknown,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): Promise<ErrorsOr<FileNameAndContent[], BaseIssue>> {
    return flatMapBaseIssueK(
        await loadSourceTexts(definition.source, config),
        async texts =>
            flatMapBaseIssueK(
                flatMapBaseIssue(
                    exactlyOneSourceText(texts, definition),
                    text =>
                        flatMapBaseIssue(
                            renderTarget(definition, dictionary, config),
                            filename =>
                                mapBaseIssue(
                                    renderIfTemplated(text, definition, dictionary, config),
                                    content => ({
                                        filename,
                                        content,
                                    }),
                                ),
                        ),
                ),
                async generated => keepIfOverwriteAllowed(generated, definition, config),
            ),
    )
}

export async function mergeFileDefinitionFn<
    FileTypes extends string,
    MergeableTypes extends FileTypes & MergeableFileTypes,
    TemplateType extends string,
>(
    definition: MergeFileOpDefinition<MergeableTypes, TemplateType>,
    dictionary: unknown,
    config: FileOperationConfig<FileTypes, MergeableTypes, TemplateType>,
): Promise<ErrorsOr<FileNameAndContent[], BaseIssue>> {
    const codec = config.codecs[definition.fileType]

    if (codec === undefined) {
        return errors(makeFileOperationIssue(
            "missingCodec",
            `No codec configured for file type ${definition.fileType}`,
            {
                type: definition.type,
                fileType: definition.fileType,
                target: definition.target,
            },
        ))
    }

    return flatMapBaseIssueK(
        await loadSourceTexts(definition.source, config),
        async texts =>
            flatMapBaseIssueK(
                flatMapBaseIssue(
                    atLeastOneSourceText(texts, definition),
                    sourceTexts =>
                        flatMapBaseIssue(
                            renderTarget(definition, dictionary, config),
                            filename =>
                                flatMapBaseIssue(
                                    renderAndDecodeAll(codec, sourceTexts, definition, dictionary, config),
                                    decoded =>
                                        mapBaseIssue(
                                            codec.encode(
                                                mergeAll([
                                                    ...decoded,
                                                    dictionaryFileContribution(filename, dictionary),
                                                ]),
                                                config.observability,
                                            ),
                                            content => ({
                                                filename,
                                                content,
                                            }),
                                        ),
                                ),
                        ),
                ),
                async generated => keepIfOverwriteAllowed(generated, definition, config),
            ),
    )
}

/**
 * Merge convention:
 *
 * Merge operations merge the decoded template values with dictionary.files[target],
 * if present.
 *
 * Merge order:
 * - first source
 * - second source
 * - later sources
 * - dictionary.files[target]
 *
 * If there is no contribution, merge with an empty object.
 */
export function dictionaryFileContribution(
    target: Filename,
    dictionary: unknown,
): unknown {
    if (
        typeof dictionary !== "object" ||
        dictionary === null ||
        !("files" in dictionary)
    ) {
        return {}
    }

    const files = (dictionary as {files?: unknown}).files
    if (typeof files !== "object" || files === null) return {}

    const contribution = (files as Record<string, unknown>)[target]
    return contribution ?? {}
}

export function defaultFileDefinitionFns<
    TemplateType extends string,
>(): FileDefinitionFns<DefaultFileTypes, MergeableFileTypes, TemplateType> {
    return {
        copy: copyFileDefinitionFn,
        merge: mergeFileDefinitionFn,
    }
}