import {BaseIssue, ErrorsOr, flatMapBaseIssueK, sequenceArrayErrorsOrK} from "@laoban/errors"
import {DirectoryName, Filename} from "@laoban/files"
import {LaobanConfigLoadConfig, LoadedLaobanConfig, loadLaobanConfig} from "@laoban/laoban_config"
import {LoadedLaobanProject, LoadedPackageDetail, LoadPackagesFn} from "./package.details.loader";


export type LoadConfigFn = typeof loadLaobanConfig

export type LoadAndWalkConfig = {
    laobanConfigLoadConfig: LaobanConfigLoadConfig
    loadConfig: LoadConfigFn
    loadPackages: LoadPackagesFn
}

export interface PackageWalkerInput {
    loadedConfig: LoadedLaobanConfig
    loadedProject: LoadedLaobanProject
    loadedPackageDetail: LoadedPackageDetail
}

export type PackageWalkerFn<C> =
    (input: PackageWalkerInput) => Promise<ErrorsOr<C, BaseIssue>>

export async function loadAndWalkPackageDetails<C>(
    config: LoadAndWalkConfig,
    start: Filename | DirectoryName,
    visit: PackageWalkerFn<C>,
): Promise<ErrorsOr<C[], BaseIssue>> {
    return flatMapBaseIssueK(
        await config.loadConfig(config.laobanConfigLoadConfig, start),
        async loadedConfig =>
            flatMapBaseIssueK(
                await config.loadPackages(loadedConfig, config.laobanConfigLoadConfig),
                loadedProject =>
                    sequenceArrayErrorsOrK(
                        Object.values(loadedProject.loadedPackageDetails).map(loadedPackageDetail =>
                            visit({
                                loadedConfig,
                                loadedProject,
                                loadedPackageDetail,
                            }),
                        ),
                    ),
            ),
    )
}