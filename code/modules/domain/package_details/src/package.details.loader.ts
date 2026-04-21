import {type BaseIssue, errors, isErrors, mapErrorsOr, type ErrorsOr, value} from "@laoban/errors";
import {type Filename, type FileOps} from "@laoban/files";
import {type LoadedLaobanConfig} from "@laoban/laoban_config";
import {type Observability} from "@laoban/observability";
import {type ValidationIssue} from "@laoban/validation";
import {type NormalisedPackageDetails, type PackageDetails} from "./package.details";
import {normalisePackageDetails} from "./package.details.normalise";
import {validatePackageDetails} from "./package.details.validator";
import {normalisePath} from "@laoban/strings";

export const packageDetailsFileName = "package.details.json" as const;

export interface LoadPackagesContext {
    fileOps: FileOps;
    observability: Observability;
}

export interface LoadedPackageDetail {
    packageFile: Filename;
    contents: NormalisedPackageDetails;
}

export type LoadedPackageDetails = Record<string, LoadedPackageDetail>;

export interface LoadedLaobanProject {
    loadedLaobanConfig: LoadedLaobanConfig;
    loadedPackageDetails: LoadedPackageDetails;
}

export type LoadPackagesIssueKind =
    | "findPackageDetailsFailed"
    | "loadPackageDetailsFailed"
    | "parsePackageDetailsFailed"
    | "duplicatePackageName";

export type LoadPackagesIssue = BaseIssue<
    LoadPackagesIssueKind,
    {
        configDirectory?: string;
        packageFile?: Filename;
        packageName?: string;
        packageFiles?: Filename[];
        markerFileName?: string;
        error?: string;
        issues?: BaseIssue[];
    }
>;

export type LoadPackagesAllIssue = LoadPackagesIssue | ValidationIssue;

export interface LoadedPackageFile {
    packageFile: Filename;
    packageDetails: PackageDetails;
    normalised: NormalisedPackageDetails;
}

export function makeLoadPackagesIssue(
    kind: LoadPackagesIssueKind,
    message: string,
    context?: LoadPackagesIssue["context"]
): LoadPackagesIssue {
    return {
        kind,
        message,
        ...(context === undefined ? {} : {context})
    };
}

function sortStrings(xs: string[]): string[] {
    return [...xs].sort((a, b) => a.localeCompare(b));
}

export function addPackageFileToValidationIssue(
    packageFile: Filename
): (issue: ValidationIssue) => ValidationIssue {
    return issue => ({
        ...issue,
        context: [packageFile, ...(issue.context ?? [])]
    });
}

export function parsePackageDetails(
    packageFile: Filename,
    text: string,
    observability: Observability
): ErrorsOr<PackageDetails, LoadPackagesAllIssue> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return errors(
            makeLoadPackagesIssue(
                "parsePackageDetailsFailed",
                `Could not parse package details JSON in ${packageFile}`,
                {
                    packageFile,
                    error: e instanceof Error ? e.message : String(e)
                }
            )
        );
    }

    return mapErrorsOr(
        validatePackageDetails([], observability)(parsed as PackageDetails),
        t => t
    );
}

export async function loadOnePackageFile(
    fileOps: FileOps,
    observability: Observability,
    packageFile: Filename
): Promise<ErrorsOr<LoadedPackageFile, LoadPackagesAllIssue>> {
    const loadedTextE = await fileOps.loadText(packageFile);

    if (isErrors(loadedTextE)) {
        return errors(
            makeLoadPackagesIssue(
                "loadPackageDetailsFailed",
                `Could not load package details file ${packageFile}`,
                {
                    packageFile,
                    issues: loadedTextE.errors
                }
            )
        );
    }

    const parsedE = parsePackageDetails(packageFile, loadedTextE.value, observability);
    if (isErrors(parsedE)) {
        return {
            ...parsedE,
            errors: parsedE.errors.map(issue =>
                issue.kind === "validation"
                    ? addPackageFileToValidationIssue(packageFile)(issue)
                    : issue
            )
        };
    }

    return value({
        packageFile,
        packageDetails: parsedE.value,
        normalised: normalisePackageDetails(parsedE.value)
    }, parsedE.warnings);
}

export function duplicatePackageIssues(duplicateMap: Record<string, Filename[]>): LoadPackagesIssue[] {
    return Object.entries(duplicateMap)
        .filter(([, files]) => files.length > 1)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([packageName, files]) =>
            makeLoadPackagesIssue(
                "duplicatePackageName",
                `Duplicate package name '${packageName}' found in multiple package details files`,
                {
                    packageName,
                    packageFiles: sortStrings(files)
                }
            )
        );
}

export async function loadPackages(
    loadedLaobanConfig: LoadedLaobanConfig,
    context: LoadPackagesContext
): Promise<ErrorsOr<LoadedLaobanProject, LoadPackagesAllIssue>> {
    const {fileOps, observability} = context;
    const {configDirectory} = loadedLaobanConfig;

    const foundE = await fileOps.findAllByNameUnder(
        configDirectory,
        packageDetailsFileName
    );

    if (isErrors(foundE)) {
        return errors(
            makeLoadPackagesIssue(
                "findPackageDetailsFailed",
                `Could not search for ${packageDetailsFileName} files under ${configDirectory}`,
                {
                    configDirectory,
                    markerFileName: packageDetailsFileName,
                    issues: foundE.errors
                }
            )
        );
    }

    const packageFiles = sortStrings(foundE.value).map(normalisePath);

    const loadedResults = await Promise.all(
        packageFiles.map(packageFile => loadOnePackageFile(fileOps, observability, packageFile))
    );

    const allErrors = loadedResults.flatMap(result => isErrors(result) ? result.errors : []);
    const allWarnings = loadedResults.flatMap(result => result.warnings ?? []);

    if (allErrors.length > 0) {
        return errors(allErrors[0], allErrors.slice(1), allWarnings);
    }

    const loadedFiles = loadedResults
        .filter((result): result is { value: LoadedPackageFile; warnings?: LoadPackagesAllIssue[] } => !isErrors(result))
        .map(result => result.value);

    const duplicateMap: Record<string, Filename[]> = {};
    for (const loaded of loadedFiles) {
        (duplicateMap[loaded.normalised.name] ??= []).push(loaded.packageFile);
    }

    const duplicateIssues = duplicatePackageIssues(duplicateMap);
    if (duplicateIssues.length > 0) {
        return errors(duplicateIssues[0], duplicateIssues.slice(1), allWarnings);
    }

    const loadedPackageDetails: LoadedPackageDetails = Object.fromEntries(
        loadedFiles
            .map(loaded => [
                loaded.normalised.name,
                {
                    packageFile: loaded.packageFile,
                    contents: loaded.normalised
                }
            ] as const)
            .sort(([a], [b]) => a.localeCompare(b))
    );

    observability.debug(
        "loading.package.details",
        "debug",
        {
            configDirectory,
            packageCount: Object.keys(loadedPackageDetails).length,
            packageNames: Object.keys(loadedPackageDetails)
        }
    );

    return value(
        {
            loadedLaobanConfig,
            loadedPackageDetails
        },
        allWarnings
    );
}