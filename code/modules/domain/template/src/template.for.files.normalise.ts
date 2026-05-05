import {FileOrUrl, Filename} from "@laoban/files"
import {
    DeprecatedTemplateCopyFileOperation,
    DeprecatedTemplateMergeFileOperation,
    LegacyTemplateFileDeclaration,
    LoadedTemplateDeclaration,
    NewTemplateFileDeclaration,
    NormalisedTemplateDeclaration,
    TemplateCopyFileDeclaration,
    TemplateCopyFileOperation,
    TemplateDeclaration,
    TemplateFileDeclaration,
    TemplateFileOperation,
    TemplateMergeFileDeclaration,
    TemplateMergeFileOperation,
    TemplateSyntax,
} from "./template.for.files"

export function normaliseLoadedTemplateDeclaration(
    loaded: LoadedTemplateDeclaration,
): NormalisedTemplateDeclaration {
    return normaliseTemplateDeclaration(
        loaded.name,
        loaded.source,
        loaded.declaration,
    )
}
export function normaliseTemplateDeclaration(
    name: string,
    source: FileOrUrl,
    declaration: TemplateDeclaration,
): NormalisedTemplateDeclaration {
    const files: Record<Filename, TemplateFileOperation> = {}

    for (const [fileName, fileDeclaration] of Object.entries(declaration.files)) {
        files[fileName] = normaliseTemplateFileDeclaration(
            fileName,
            fileDeclaration,
            declaration.defaultSrcPrefix,
        )
    }

    return {
        name,
        source,
        files,
    }
}

export function normaliseTemplateFileDeclaration(
    fileName: Filename,
    declaration: TemplateFileDeclaration,
    defaultSrcPrefix?: FileOrUrl,
): TemplateFileOperation {
    return isNewTemplateFileDeclaration(declaration)
        ? normaliseNewTemplateFileDeclaration(fileName, declaration, defaultSrcPrefix)
        : normaliseLegacyTemplateFileDeclaration(fileName, declaration, defaultSrcPrefix)
}

export function normaliseNewTemplateFileDeclaration(
    fileName: Filename,
    declaration: NewTemplateFileDeclaration,
    defaultSrcPrefix?: FileOrUrl,
): TemplateCopyFileOperation | TemplateMergeFileOperation {
    switch (declaration.type) {
        case "copy":
            return normaliseNewCopyTemplateFileDeclaration(
                fileName,
                declaration,
                defaultSrcPrefix,
            )

        case "merge":
            return normaliseNewMergeTemplateFileDeclaration(
                fileName,
                declaration,
                defaultSrcPrefix,
            )
    }
}

export function normaliseNewCopyTemplateFileDeclaration(
    fileName: Filename,
    declaration: TemplateCopyFileDeclaration,
    defaultSrcPrefix?: FileOrUrl,
): TemplateCopyFileOperation {
    return {
        type: "copy",
        target: declaration.target ?? fileName,
        source: declaration.source ?? defaultSource(defaultSrcPrefix, fileName),
        ...(declaration.overwrite === undefined ? {} : {overwrite: declaration.overwrite}),
        ...(declaration.template === undefined ? {} : {template: declaration.template}),
        deprecated: false,
    }
}

export function normaliseNewMergeTemplateFileDeclaration(
    fileName: Filename,
    declaration: TemplateMergeFileDeclaration,
    defaultSrcPrefix?: FileOrUrl,
): TemplateMergeFileOperation {
    return {
        type: "merge",
        target: declaration.target ?? fileName,
        source: declaration.source ?? defaultSource(defaultSrcPrefix, fileName),
        fileType: declaration.fileType,
        ...(declaration.overwrite === undefined ? {} : {overwrite: declaration.overwrite}),
        ...(declaration.template === undefined ? {} : {template: declaration.template}),
        deprecated: false,
    }
}

export function normaliseLegacyTemplateFileDeclaration(
    fileName: Filename,
    declaration: LegacyTemplateFileDeclaration,
    defaultSrcPrefix?: FileOrUrl,
): DeprecatedTemplateCopyFileOperation | DeprecatedTemplateMergeFileOperation {
    if (declaration.mergeWithParent !== undefined)
        return normaliseLegacyMergeTemplateFileDeclaration(
            fileName,
            declaration,
            defaultSrcPrefix,
        )

    return normaliseLegacyCopyTemplateFileDeclaration(
        fileName,
        declaration,
        defaultSrcPrefix,
    )
}

export function normaliseLegacyCopyTemplateFileDeclaration(
    fileName: Filename,
    declaration: LegacyTemplateFileDeclaration,
    defaultSrcPrefix?: FileOrUrl,
): DeprecatedTemplateCopyFileOperation {
    const template = legacyTemplateSyntax(declaration.template)

    return {
        type: "copy",
        target: fileName,
        source: declaration.file ?? defaultSource(defaultSrcPrefix, fileName),
        ...(legacyOverwrite(declaration) === undefined ? {} : {overwrite: legacyOverwrite(declaration)}),
        ...(template === undefined ? {} : {template}),
        deprecated: true,
    }
}

export function normaliseLegacyMergeTemplateFileDeclaration(
    fileName: Filename,
    declaration: LegacyTemplateFileDeclaration,
    defaultSrcPrefix?: FileOrUrl,
): DeprecatedTemplateMergeFileOperation {
    const template = legacyTemplateSyntax(declaration.template)

    return {
        type: "merge",
        target: fileName,
        source: declaration.file ?? defaultSource(defaultSrcPrefix, fileName),
        fileType: declaration.mergeWithParent!,
        ...(legacyOverwrite(declaration) === undefined ? {} : {overwrite: legacyOverwrite(declaration)}),
        ...(template === undefined ? {} : {template}),
        deprecated: true,
    }
}

export function isNewTemplateFileDeclaration(
    declaration: TemplateFileDeclaration,
): declaration is NewTemplateFileDeclaration {
    return (
        typeof declaration === "object" &&
        declaration !== null &&
        "type" in declaration
    )
}

export function defaultSource(
    defaultSrcPrefix: FileOrUrl | undefined,
    fileName: Filename,
): FileOrUrl {
    if (defaultSrcPrefix === undefined || defaultSrcPrefix === "")
        return `./${fileName}`

    return `${trimTrailingSlash(defaultSrcPrefix)}/${fileName}`
}

export function legacyOverwrite(
    declaration: LegacyTemplateFileDeclaration,
): boolean | undefined {
    return declaration.sample === true
        ? false
        : undefined
}

export function legacyTemplateSyntax(
    syntax: TemplateSyntax | undefined,
): {as: TemplateSyntax} | undefined {
    return syntax === undefined
        ? undefined
        : {as: syntax}
}

export function trimTrailingSlash(
    value: string,
): string {
    return value.endsWith("/")
        ? value.slice(0, -1)
        : value
}