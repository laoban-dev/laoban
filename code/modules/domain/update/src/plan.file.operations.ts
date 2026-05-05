import {BaseIssue, ErrorsOr, flatMapBaseIssueK, sequenceArrayErrorsOrK, value} from "@laoban/errors"
import {DirectoryName, FileNameAndContent, Filename} from "@laoban/files"
import {LoadedLaobanConfig} from "@laoban/laoban_config"
import {
    LoadedLaobanProject,
    LoadedPackageDetail,
    LoadAndWalkConfig,
    PackageWalkerInput,
} from "@laoban/package_details"
import {
    NormalisedTemplateDeclaration,
    TemplateFileOperation,
} from "@laoban/template_files"
import {ThrottlePlanFn} from "@laoban/topologicalsort"

export interface PlanManagedFilesConfig extends LoadAndWalkConfig {
    loadTemplate: LoadTemplateFn
    planTemplateFileOperation: PlanTemplateFileOperationFn
    throttlePlan: ThrottlePlanFn<LoadedPackageDetail>
    throttle: number
    consumeBatch: ConsumeManagedFilesBatchFn
}

export type LoadedManagedFilesTemplate = NormalisedTemplateDeclaration
export type TemplateFileDefinition = TemplateFileOperation

export type LoadTemplateFn =
    (input: LoadTemplateInput) => Promise<ErrorsOr<NormalisedTemplateDeclaration, BaseIssue>>

export interface LoadTemplateInput {
    loadedConfig: LoadedLaobanConfig
    loadedPackageDetail: LoadedPackageDetail
    templateName: string
}

export type PlanTemplateFileOperationFn =
    (input: PlanTemplateFileOperationInput) => Promise<ErrorsOr<FileNameAndContent[], BaseIssue>>

export interface PlanTemplateFileOperationInput {
    loadedConfig: LoadedLaobanConfig
    loadedPackageDetail: LoadedPackageDetail
    template: NormalisedTemplateDeclaration
    fileName: string
    fileDef: TemplateFileOperation
}

/**
 * @deprecated Use PlanTemplateFileOperationFn.
 */
export type PlanOneManagedFileFn = PlanTemplateFileOperationFn

/**
 * @deprecated Use PlanTemplateFileOperationInput.
 */
export type PlanOneManagedFileInput = PlanTemplateFileOperationInput

export type ConsumeManagedFilesBatchFn =
    (input: ConsumeManagedFilesBatchInput) => Promise<ErrorsOr<ConsumeManagedFilesBatchResult, BaseIssue>>

export interface ConsumeManagedFilesBatchInput {
    batchNumber: number
    packages: PlannedPackageFiles[]
    files: FileNameAndContent[]
}

export interface ConsumeManagedFilesBatchResult {
    files: number
}

export interface PlannedTemplateFile {
    packageName: string
    templateName: string
    fileName: string
    writes: FileNameAndContent[]
}

export interface PlannedPackageFiles {
    packageName: string
    templateName: string
    files: PlannedTemplateFile[]
}

export interface ManagedFilesRunResult {
    batches: number
    packages: number
    files: number
}

export type PlanManagedFilesFn =
    typeof planManagedFiles

export async function planManagedFiles(
    config: PlanManagedFilesConfig,
    start: Filename | DirectoryName,
): Promise<ErrorsOr<ManagedFilesRunResult, BaseIssue>> {
    return flatMapBaseIssueK(
        await config.loadConfig(config.laobanConfigLoadConfig, start),
        async loadedConfig =>
            flatMapBaseIssueK(
                await config.loadPackages(loadedConfig, config.laobanConfigLoadConfig),
                loadedProject =>
                    planLoadedManagedFiles(config, loadedProject),
            ),
    )
}

export async function planLoadedManagedFiles(
    config: PlanManagedFilesConfig,
    loadedProject: LoadedLaobanProject,
): Promise<ErrorsOr<ManagedFilesRunResult, BaseIssue>> {
    const packages = Object.keys(loadedProject.loadedPackageDetails).map(
        packageName => loadedProject.loadedPackageDetails[packageName],
    )
    const batches = config.throttlePlan([packages], config.throttle)

    return planManagedFileBatches(
        config,
        loadedProject,
        batches,
    )
}

export async function planManagedFileBatches(
    config: PlanManagedFilesConfig,
    loadedProject: LoadedLaobanProject,
    batches: LoadedPackageDetail[][],
): Promise<ErrorsOr<ManagedFilesRunResult, BaseIssue>> {
    let fileCount = 0
    let packageCount = 0

    for (let batchNumber = 0; batchNumber < batches.length; batchNumber++) {
        const batch = batches[batchNumber]

        const plannedBatch = await planOneManagedFileBatch(
            config,
            loadedProject,
            batch,
        )

        const consumedBatch = await flatMapBaseIssueK(
            plannedBatch,
            planned =>
                config.consumeBatch({
                    batchNumber,
                    packages: planned,
                    files: flattenPlannedPackageFiles(planned),
                }),
        )

        if ("errors" in consumedBatch) return consumedBatch

        packageCount += batch.length
        fileCount += consumedBatch.value.files
    }

    return value({
        batches: batches.length,
        packages: packageCount,
        files: fileCount,
    })
}

export async function planOneManagedFileBatch(
    config: PlanManagedFilesConfig,
    loadedProject: LoadedLaobanProject,
    batch: LoadedPackageDetail[],
): Promise<ErrorsOr<PlannedPackageFiles[], BaseIssue>> {
    return sequenceArrayErrorsOrK(
        batch.map(loadedPackageDetail =>
            planOnePackageManagedFiles(
                config,
                {
                    loadedConfig: loadedProject.loadedLaobanConfig,
                    loadedProject,
                    loadedPackageDetail,
                },
            ),
        ),
    )
}

export async function planOnePackageManagedFiles(
    config: PlanManagedFilesConfig,
    input: PackageWalkerInput,
): Promise<ErrorsOr<PlannedPackageFiles, BaseIssue>> {
    const {loadedConfig, loadedPackageDetail} = input
    const templateName = loadedPackageDetail.contents.template

    return flatMapBaseIssueK(
        await config.loadTemplate({
            loadedConfig,
            loadedPackageDetail,
            templateName,
        }),
        template =>
            planTemplateManagedFiles(
                config,
                loadedConfig,
                loadedPackageDetail,
                template,
            ),
    )
}

export async function planTemplateManagedFiles(
    config: PlanManagedFilesConfig,
    loadedConfig: LoadedLaobanConfig,
    loadedPackageDetail: LoadedPackageDetail,
    template: NormalisedTemplateDeclaration,
): Promise<ErrorsOr<PlannedPackageFiles, BaseIssue>> {
    return flatMapBaseIssueK(
        await sequenceArrayErrorsOrK(
            Object.keys(template.files).map(fileName =>
                planOneTemplateFile(
                    config,
                    loadedConfig,
                    loadedPackageDetail,
                    template,
                    fileName,
                    template.files[fileName],
                ),
            ),
        ),
        files =>
            Promise.resolve(value({
                packageName: loadedPackageDetail.contents.name,
                templateName: loadedPackageDetail.contents.template,
                files,
            })),
    )
}

export async function planOneTemplateFile(
    config: PlanManagedFilesConfig,
    loadedConfig: LoadedLaobanConfig,
    loadedPackageDetail: LoadedPackageDetail,
    template: NormalisedTemplateDeclaration,
    fileName: string,
    fileDef: TemplateFileOperation,
): Promise<ErrorsOr<PlannedTemplateFile, BaseIssue>> {
    return flatMapBaseIssueK(
        await config.planTemplateFileOperation({
            loadedConfig,
            loadedPackageDetail,
            template,
            fileName,
            fileDef,
        }),
        writes =>
            Promise.resolve(value({
                packageName: loadedPackageDetail.contents.name,
                templateName: loadedPackageDetail.contents.template,
                fileName,
                writes,
            })),
    )
}

export function flattenPlannedPackageFiles(
    packages: PlannedPackageFiles[],
): FileNameAndContent[] {
    const result: FileNameAndContent[] = []

    for (const pkg of packages) {
        for (const file of pkg.files) {
            for (const write of file.writes) {
                result.push(write)
            }
        }
    }

    return result
}