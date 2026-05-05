import {ErrorsOr, errors, value} from "@laoban/errors"
import {Observability} from "@laoban/observability"
import {
    chainValidators,
    composeTypedOr,
    deprecatedField,
    ifPresent,
    mustBeArrayOfIfPresent,
    mustBeBooleanIfPresent,
    mustBeNameAnd,
    mustBeObjectWithFields,
    mustBeOneOf,
    mustBeString,
    mustBeStringIfPresent,
    renderContext,
    ValidationIssue,
    Validator,
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

export const templateSyntaxValidator: Validator<TemplateSyntax> =
    mustBeOneOf("${}", "{{}}", ":", "<<>>")

export const templateObjectValidator: Validator<{as: TemplateSyntax}> =
    mustBeObjectWithFields<{as: TemplateSyntax}>({
        as: templateSyntaxValidator,
    }, true)

export const templateParentDefinitionValidator: Validator<TemplateParentDefinition> =
    mustBeObjectWithFields<TemplateParentDefinition>({
        src: mustBeString,
        delete: mustBeArrayOfIfPresent(mustBeString),
    }, true)

const deprecatedLegacyTemplateFileDeclaration: Validator<LegacyTemplateFileDeclaration> =
    (context) =>
        (input): ErrorsOr<LegacyTemplateFileDeclaration, ValidationIssue> =>
            value(input, [
                {
                    kind: "validation",
                    severity: "warning",
                    context,
                    code: "deprecated",
                    message: "Legacy template file declaration syntax is deprecated. Use explicit copy/merge file operations.",
                },
            ])

const fileOrUrlOrArrayIfPresent: Validator<string | string[] | undefined> =
    (context) =>
        (input): ErrorsOr<string | string[] | undefined, ValidationIssue> => {
            if (input === undefined || input === null) return value(input)
            if (typeof input === "string") return value(input)

            if (Array.isArray(input)) {
                const badIndex = input.findIndex(item => typeof item !== "string")
                if (badIndex === -1) return value(input)

                return errors({
                    kind: "validation",
                    severity: "error",
                    context,
                    code: "wrong.type",
                    message: `${renderContext(context)} must be a string or string[] but array item ${badIndex} was a ${describeType(input[badIndex])}`,
                })
            }

            return errors({
                kind: "validation",
                severity: "error",
                context,
                code: "wrong.type",
                message: `${renderContext(context)} must be a string or string[] but was a ${describeType(input)}`,
            })
        }

export const templateCopyFileDeclarationValidator: Validator<TemplateCopyFileDeclaration> =
    mustBeObjectWithFields<TemplateCopyFileDeclaration>({
        type: mustBeOneOf("copy"),
        source: mustBeStringIfPresent,
        target: mustBeStringIfPresent,
        overwrite: mustBeBooleanIfPresent,
        template: ifPresent(templateObjectValidator),
    }, true)

export const templateMergeFileDeclarationValidator: Validator<TemplateMergeFileDeclaration> =
    mustBeObjectWithFields<TemplateMergeFileDeclaration>({
        type: mustBeOneOf("merge"),
        source: fileOrUrlOrArrayIfPresent,
        target: mustBeStringIfPresent,
        fileType: mustBeOneOf("json"),
        overwrite: mustBeBooleanIfPresent,
        template: ifPresent(templateObjectValidator),
    }, true)

export const legacyTemplateFileDeclarationValidator: Validator<LegacyTemplateFileDeclaration> =
    chainValidators(
        deprecatedLegacyTemplateFileDeclaration,
        mustBeObjectWithFields<LegacyTemplateFileDeclaration>({
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

export const newTemplateFileDeclarationValidator: Validator<TemplateCopyFileDeclaration | TemplateMergeFileDeclaration> =
    composeTypedOr(
        templateFileDeclarationType,
        {
            copy: templateCopyFileDeclarationValidator,
            merge: templateMergeFileDeclarationValidator,
        },
    )

export const templateFileDeclarationValidator: Validator<TemplateFileDeclaration> =
    (context, observability) =>
        (input): ErrorsOr<TemplateFileDeclaration, ValidationIssue> => {
            if (!hasTypeField(input)) {
                return legacyTemplateFileDeclarationValidator(context, observability)(
                    input as LegacyTemplateFileDeclaration,
                )
            }

            return newTemplateFileDeclarationValidator(context, observability)(
                input as TemplateCopyFileDeclaration | TemplateMergeFileDeclaration,
            )
        }

export const templateDeclarationValidator: Validator<TemplateDeclaration> =
    mustBeObjectWithFields<TemplateDeclaration>({
        parent: mustBeArrayOfIfPresent(templateParentDefinitionValidator),
        defaultSrcPrefix: mustBeStringIfPresent,
        description: mustBeStringIfPresent,
        documentation: mustBeStringIfPresent,
        repository: mustBeStringIfPresent,
        files: mustBeNameAnd(templateFileDeclarationValidator, true),
    }, true)

export function validateTemplateDeclaration(
    input: TemplateDeclaration,
    observability: Observability,
): ErrorsOr<TemplateDeclaration, ValidationIssue> {
    return templateDeclarationValidator([], observability)(input)
}

export function validateTemplateFileDeclaration(
    input: TemplateFileDeclaration,
    observability: Observability,
): ErrorsOr<TemplateFileDeclaration, ValidationIssue> {
    return templateFileDeclarationValidator([], observability)(input)
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