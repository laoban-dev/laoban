import {ErrorsOr} from "@laoban/errors"
import {
    FileOpIssue,
    FileOpsHelperConfig,
    FileOpsHelperDefaults,
    Filename,
    WriteTextFn,
} from "@laoban/files"

export type WriteTextDefaults = FileOpsHelperDefaults

export const writeText =
    (defaults: WriteTextDefaults): WriteTextFn =>
        (
            filename: Filename,
            content: string,
            config?: FileOpsHelperConfig,
        ): Promise<ErrorsOr<void, FileOpIssue>> =>
            defaults.infrastructure.writeText(
                filename,
                content,
                {
                    ...config,
                    infrastructure: config?.infrastructure ?? defaults.infrastructure,
                },
            )