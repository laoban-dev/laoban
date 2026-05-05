import {BaseIssue, ErrorsOr, mapBaseIssue, sequenceArrayErrorsOrK, value} from "@laoban/errors"
import {FileNameAndContent, FileOpsHelperConfig, WriteTextFileOps} from "@laoban/files"
import {Observability} from "@laoban/observability"

export interface UpdateManagedFilesConfig {
    observability: Observability
    fileOps: WriteTextFileOps
    fileOpsHelperConfig?: FileOpsHelperConfig
    debug: boolean
    dryRun: boolean
}

export interface UpdateManagedFilesResult {
    files: number
    written: number
    skipped: number
}

export interface UpdateOneManagedFileResult {
    filename: string
    written: boolean
}

export type UpdateManagedFilesFn = typeof updateManagedFiles

export async function updateManagedFiles(
    config: UpdateManagedFilesConfig,
    files: FileNameAndContent[],
): Promise<ErrorsOr<UpdateManagedFilesResult, BaseIssue>> {
    config.observability.countMetric("managedFiles.update.files.requested")

    return mapBaseIssue(
        await sequenceArrayErrorsOrK(
            files.map(file =>
                updateOneManagedFile(config, file),
            ),
        ),
        results => {
            const written = results.filter(result => result.written).length
            const skipped = results.filter(result => !result.written).length

            config.observability.countMetric("managedFiles.update.files.completed")
            results
                .filter(result => result.written)
                .forEach(() => config.observability.countMetric("managedFiles.update.files.written"))
            results
                .filter(result => !result.written)
                .forEach(() => config.observability.countMetric("managedFiles.update.files.skipped"))

            return {
                files: results.length,
                written,
                skipped,
            }
        },
    )
}

export async function updateOneManagedFile(
    config: UpdateManagedFilesConfig,
    file: FileNameAndContent,
): Promise<ErrorsOr<UpdateOneManagedFileResult, BaseIssue>> {
    config.observability.countMetric("managedFiles.update.file.requested")

    if (config.debug || config.dryRun)
        debugManagedFile(config, file)

    if (config.dryRun) {
        config.observability.countMetric("managedFiles.update.file.skipped")
        return value({
            filename: file.filename,
            written: false,
        })
    }

    return mapBaseIssue(
        await config.fileOps.writeText(
            file.filename,
            file.content,
            config.fileOpsHelperConfig,
        ),
        () => {
            config.observability.countMetric("managedFiles.update.file.written")
            return {
                filename: file.filename,
                written: true,
            }
        },
    )
}

export function debugManagedFile(
    config: UpdateManagedFilesConfig,
    file: FileNameAndContent,
): void {
    config.observability.log(`Managed file: ${file.filename}`)
    config.observability.log(file.content)
}