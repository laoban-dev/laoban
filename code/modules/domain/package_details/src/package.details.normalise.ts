import {NormalisedPackageDetails, PackageDetails} from "./package.details";

const unique = <T>(ts: T[]): T[] => [...new Set(ts)]

export function normalisePackageDetails(details: PackageDetails): NormalisedPackageDetails {
    const links = details.links ?? []
    const devLinks = details.devLinks ?? []
    const peerLinks = details.peerLinks ?? []

    return {
        template: details.template,
        name: details.name,
        description: details.description,
        links,
        devLinks,
        peerLinks,
        allLinks: unique([...links, ...devLinks, ...peerLinks]),
        guards: details.guards ?? {},
        files: details.files ?? {},
        meta: details.meta ?? {}
    }
}