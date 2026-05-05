import {FileOrUrl, Filename} from "@laoban/files"

export type TemplateSyntax =
    | "${}"
    | "{{}}"
    | ":"
    | "<<>>"


export type TemplateMergeType =
    | "json"

export type TemplateFileOperation =
    | TemplateCopyFileOperation
    | TemplateMergeFileOperation
    | DeprecatedTemplateCopyFileOperation
    | DeprecatedTemplateMergeFileOperation

export interface TemplateFileOperationBase {
    target: Filename
    overwrite?: boolean
    template?: {
        as: TemplateSyntax
    }
}

export interface TemplateCopyFileOperation extends TemplateFileOperationBase {
    type: "copy"
    source: FileOrUrl
    deprecated?: false
}

export interface TemplateMergeFileOperation extends TemplateFileOperationBase {
    type: "merge"
    source: FileOrUrl | FileOrUrl[]
    fileType: TemplateMergeType
    deprecated?: false
}

/**
 * Normalised operation produced from the old template file declaration shape.
 *
 * @deprecated Exists only to support legacy template.json declarations.
 */
export interface DeprecatedTemplateCopyFileOperation extends TemplateFileOperationBase {
    type: "copy"
    source: FileOrUrl
    deprecated: true
}

/**
 * Normalised operation produced from the old template file declaration shape.
 *
 * @deprecated Exists only to support legacy template.json declarations.
 */
export interface DeprecatedTemplateMergeFileOperation extends TemplateFileOperationBase {
    type: "merge"
    source: FileOrUrl | FileOrUrl[]
    fileType: TemplateMergeType
    deprecated: true
}

export interface TemplateParentDefinition {
    src: FileOrUrl
    delete?: Filename[]
}

export interface TemplateDeclaration {
    parent?: TemplateParentDefinition[]
    defaultSrcPrefix?: FileOrUrl
    description?: string
    documentation?: string
    repository?: string
    files: Record<Filename, TemplateFileDeclaration>
}

export type TemplateFileDeclaration =
    | NewTemplateFileDeclaration
    | LegacyTemplateFileDeclaration

export type NewTemplateFileDeclaration =
    | TemplateCopyFileDeclaration
    | TemplateMergeFileDeclaration

export interface TemplateCopyFileDeclaration {
    type: "copy"
    source?: FileOrUrl
    target?: Filename
    overwrite?: boolean
    template?: {
        as: TemplateSyntax
    }
}

export interface TemplateMergeFileDeclaration {
    type: "merge"
    source?: FileOrUrl | FileOrUrl[]
    target?: Filename
    fileType: TemplateMergeType
    overwrite?: boolean
    template?: {
        as: TemplateSyntax
    }
}

/**
 * Old Laoban template file entry shape.
 *
 * @deprecated New templates should use explicit copy/merge file operations.
 */
export interface LegacyTemplateFileDeclaration {
    /**
     * @deprecated Use `source` on a copy/merge declaration.
     */
    file?: FileOrUrl

    /**
     * @deprecated Use `template: { as: "${}" }`.
     */
    template?: TemplateSyntax

    /**
     * @deprecated Use `type: "merge"` and `fileType: "json"`.
     */
    mergeWithParent?: TemplateMergeType

    /**
     * @deprecated Post-processing is not part of the new file operation model.
     */
    postProcess?: string

    /**
     * @deprecated Use `overwrite: false`.
     */
    sample?: boolean
}

export interface LoadedTemplateDeclaration {
    name: string
    source: FileOrUrl
    declaration: TemplateDeclaration
}

export interface NormalisedTemplateDeclaration {
    name: string
    source: FileOrUrl
    files: Record<Filename, TemplateFileOperation>
}