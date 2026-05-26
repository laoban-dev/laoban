import {ErrorsOr, errors, value} from "@laoban/errors"
import {Observability} from "@laoban/observability"
import {
    chainValidators,
    composeTypedOr,
    deprecatedField,
    fileValidationContext,
    ifPresent,
    mustBeArrayOfIfPresent,
    mustBeBooleanIfPresent,
    mustBeNameAnd,
    mustBeObjectWithFields,
    mustBeOneOf,
    mustBeString,
    mustBeStringIfPresent,
    oneValidationError,
    renderContext,
    validationWarning,
    type AnyValidationContext,
    type ValidationIssue,
    type Validator,
} from "@laoban/validation"
import {
    LegacyTemplateFileDeclaration,
    TemplateCopyFileDeclaration,
    TemplateDeclaration,
    TemplateFileDeclaration,
    TemplateMergeFileDeclaration,
    TemplateParentDefinition,
    TemplateSyntax,
} from "./template.for.files"

export const templateSyntaxValidator: Validator<TemplateSyntax, AnyValidationContext> =
    mustBeOneOf("${}", "{{}}", ":", "<<>>")

export const templateObjectValidator: Validator<{as: TemplateSyntax}, AnyValidationContext> =
    mustBeObjectWithFields<{as: TemplateSyntax}, AnyValidationContext>({
        as: templateSyntaxValidator,
    }, true)

export const templateParentDefinitionValidator: Validator<TemplateParentDefinition, AnyValidationContext> =
    mustBeObjectWithFields<TemplateParentDefinition, AnyValidationContext>({
        src: mustBeString,
        delete: mustBeArrayOfIfPresent(mustBeString),
    }, true)

const deprecatedLegacyTemplateFileDeclaration: Validator<LegacyTemplateFileDeclaration, AnyValidationContext> =
    context => input =>
        value(input, [
            validationWarning(
                context,
                "Legacy template file declaration syntax is deprecated. Use explicit copy/merge file operations.",
                {code: "deprecated"},
            ),
        ])

const fileOrUrlOrArrayIfPresent: Validator<string | string[] | undefined, AnyValidationContext> =
    context => input => {
        if (input === undefined || input === null) return value(input)
        if (typeof input === "string") return value(input)

        if (Array.isArray(input)) {
            const badIndex = input.findIndex(item => typeof item !== "string")
            if (badIndex === -1) return value(input)

            return oneValidationError(
                context,
                `${renderContext(context)} must be a string or string[] but array item ${badIndex} was a ${describeType(input[badIndex])}`,
                {code: "wrong.type"},
            )
        }

        return oneValidationError(
            context,
            `${renderContext(context)} must be a string or string[] but was a ${describeType(input)}`,
            {code: "wrong.type"},
        )
    }

export const templateCopyFileDeclarationValidator: Validator<TemplateCopyFileDeclaration, AnyValidationContext> =
    mustBeObjectWithFields<TemplateCopyFileDeclaration, AnyValidationContext>({
        type: mustBeOneOf("copy"),
        source: mustBeStringIfPresent,
        target: mustBeStringIfPresent,
        overwrite: mustBeBooleanIfPresent,
        template: ifPresent(templateObjectValidator),
    }, true)

export const templateMergeFileDeclarationValidator: Validator<TemplateMergeFileDeclaration, AnyValidationContext> =
    mustBeObjectWithFields<TemplateMergeFileDeclaration, AnyValidationContext>({
        type: mustBeOneOf("merge"),
        source: fileOrUrlOrArrayIfPresent,
        target: mustBeStringIfPresent,
        fileType: mustBeOneOf("json"),
        overwrite: mustBeBooleanIfPresent,
        template: ifPresent(templateObjectValidator),
    }, true)

export const legacyTemplateFileDeclarationValidator: Validator<LegacyTemplateFileDeclaration, AnyValidationContext> =
    chainValidators(
        deprecatedLegacyTemplateFileDeclaration,
        mustBeObjectWithFields<LegacyTemplateFileDeclaration, AnyValidationContext>({
            file: mustBeStringIfPresent,
            template: ifPresent(templateSyntaxValidator),
            mergeWithParent: ifPresent(mustBeOneOf("json")),
            postProcess: chainValidators(
                ifPresent(deprecatedField("postProcess is deprecated and is not part of the new file operation model")),
                mustBeStringIfPresent,
            ),
            sample: mustBeBooleanIfPresent,
        }, true),
    )

export const newTemplateFileDeclarationValidator: Validator<TemplateCopyFileDeclaration | TemplateMergeFileDeclaration, AnyValidationContext> =
    composeTypedOr(
        templateFileDeclarationType,
        {
            copy: templateCopyFileDeclarationValidator,
            merge: templateMergeFileDeclarationValidator,
        },
    )

export const templateFileDeclarationValidator: Validator<TemplateFileDeclaration, AnyValidationContext> =
    (context, observability) => input => {
        if (!hasTypeField(input)) {
            return legacyTemplateFileDeclarationValidator(context, observability)(
                input as LegacyTemplateFileDeclaration,
            )
        }

        return newTemplateFileDeclarationValidator(context, observability)(
            input as TemplateCopyFileDeclaration | TemplateMergeFileDeclaration,
        )
    }

export const templateDeclarationValidator: Validator<TemplateDeclaration, AnyValidationContext> =
    mustBeObjectWithFields<TemplateDeclaration, AnyValidationContext>({
        parent: mustBeArrayOfIfPresent(templateParentDefinitionValidator),
        defaultSrcPrefix: mustBeStringIfPresent,
        description: mustBeStringIfPresent,
        documentation: mustBeStringIfPresent,
        repository: mustBeStringIfPresent,
        files: mustBeNameAnd(templateFileDeclarationValidator, true),
    }, true)

export function validateTemplateDeclaration(
    currentFile: string,
    input: TemplateDeclaration,
    observability: Observability,
): ErrorsOr<TemplateDeclaration, ValidationIssue> {
    return templateDeclarationValidator(
        fileValidationContext(currentFile),
        observability,
    )(input)
}

export function validateTemplateFileDeclaration(
    currentFile: string,
    input: TemplateFileDeclaration,
    observability: Observability,
): ErrorsOr<TemplateFileDeclaration, ValidationIssue> {
    return templateFileDeclarationValidator(
        fileValidationContext(currentFile),
        observability,
    )(input)
}

function describeType(input: unknown): string {
    if (Array.isArray(input)) return "array"
    if (input === null) return "null"
    return typeof input
}

function hasTypeField(
    input: TemplateFileDeclaration,
): boolean {
    return (
        typeof input === "object" &&
        input !== null &&
        "type" in input
    )
}

function templateFileDeclarationType(
    input: TemplateCopyFileDeclaration | TemplateMergeFileDeclaration,
): "copy" | "merge" {
    return input.type
}