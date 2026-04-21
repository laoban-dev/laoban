import {ErrorsOr} from "@laoban/errors";
import {Observability} from "@laoban/observability";
import {
    NameAndDependsOn,
    TopologicalGenerationIssue,
    topologicalGenerations
} from "@laoban/topologicalsort";
import {NormalisedPackageDetails} from "./package.details";

export type PackageDetailsTopologicalSortIssue = TopologicalGenerationIssue;

export interface PackageDetailsTopologicalSortConfig {
    purpose: string;
    observability: Observability;
}

export const packageDetailsGraph: NameAndDependsOn<NormalisedPackageDetails> = {
    getName: (pkg: NormalisedPackageDetails) => pkg.name,
    dependsOn: (pkg: NormalisedPackageDetails) => pkg.allLinks
};

export function topologicallySortPackageDetails(
    packagesByName: Record<string, NormalisedPackageDetails>,
    config: PackageDetailsTopologicalSortConfig
): ErrorsOr<NormalisedPackageDetails[][], PackageDetailsTopologicalSortIssue> {
    return topologicalGenerations(
        config.purpose,
        Object.values(packagesByName),
        packageDetailsGraph,
        config.observability
    );
}