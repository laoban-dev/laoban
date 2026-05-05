import type {ICodec} from "@laoban/codec"
import {
    type BaseIssue,
    errors,
    type ErrorsOr,
    flatMapBaseIssue,
    flatMapBaseIssueK,
    value,
} from "@laoban/errors"
import type {
    FileOps,
    FileOrUrl,
    LoadTextConfig,
} from "@laoban/files"
import type {Observability} from "@laoban/observability"
import {
    LoadedTemplateDeclaration,
    NormalisedTemplateDeclaration,
    TemplateDeclaration,
} from "./template.for.files"
import {normaliseLoadedTemplateDeclaration} from "./template.for.files.normalise"
import {validateTemplateDeclaration} from "./template.for.files.validate"

export interface LoadNormalisedTemplateConfig {
    observability: Observability
    fileOps: Pick<FileOps, "loadText">
    loadTextConfig: LoadTextConfig
    jsonCodec: ICodec<unknown>
}

export interface LoadNormalisedTemplateInput {
    templates: Record<string, FileOrUrl>
    templateName: string

    /**
     * Human-readable diagnostic context, for example:
     * "package alpha".
     */
    requestedBy: string
}

export type LoadTemplateIssueKind =
    | "unknownTemplate"

export type LoadTemplateIssueContext = Readonly<{
    templateName: string
    requestedBy: string
    availableTemplates: string[]
}>

export type LoadTemplateIssue =
    BaseIssue<LoadTemplateIssueKind, LoadTemplateIssueContext>

export function makeLoadTemplateIssue(
    kind: LoadTemplateIssueKind,
    message: string,
    context: LoadTemplateIssueContext,
): LoadTemplateIssue {
    return {
        kind,
        message,
        context,
    }
}

export async function loadNormalisedTemplate(
    config: LoadNormalisedTemplateConfig,
    input: LoadNormalisedTemplateInput,
): Promise<ErrorsOr<NormalisedTemplateDeclaration, BaseIssue>> {
    return flatMapBaseIssueK(
        templateSource(input),
        async source =>
            flatMapBaseIssueK(
                await config.fileOps.loadText(
                    source,
                    config.loadTextConfig,
                ),
                async text =>
                    Promise.resolve(
                        flatMapBaseIssue(
                            config.jsonCodec.decode(text, config.observability),
                            decoded =>
                                flatMapBaseIssue(
                                    validateTemplateDeclaration(
                                        decoded as TemplateDeclaration,
                                        config.observability,
                                    ),
                                    declaration =>
                                        value(
                                            normaliseLoadedTemplateDeclaration(
                                                loadedTemplateDeclaration(
                                                    input.templateName,
                                                    source,
                                                    declaration,
                                                ),
                                            ),
                                        ),
                                ),
                        ),
                    ),
            ),
    )
}

export function templateSource(
    input: LoadNormalisedTemplateInput,
): ErrorsOr<FileOrUrl, LoadTemplateIssue> {
    const source = input.templates[input.templateName]

    if (source !== undefined) return value(source)

    return errors(makeLoadTemplateIssue(
        "unknownTemplate",
        unknownTemplateMessage(input),
        {
            templateName: input.templateName,
            requestedBy: input.requestedBy,
            availableTemplates: Object.keys(input.templates).sort(),
        },
    ))
}

export function unknownTemplateMessage(
    input: LoadNormalisedTemplateInput,
): string {
    return `Unknown template '${input.templateName}' requested by ${input.requestedBy}`
}

export function loadedTemplateDeclaration(
    name: string,
    source: FileOrUrl,
    declaration: TemplateDeclaration,
): LoadedTemplateDeclaration {
    return {
        name,
        source,
        declaration,
    }
}