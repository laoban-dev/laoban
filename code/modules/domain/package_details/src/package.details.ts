export type PackageName = string
export type GuardName = string
export type ManagedFileName = string

export interface PackageDetails {
    template: string
    name: PackageName
    description?: string
    links?: PackageName[]
    devLinks?: PackageName[]
    peerLinks?: PackageName[]
    guards?: Record<GuardName, boolean>
    files?: Record<ManagedFileName, any>
    meta?: Record<string, any>
}

export interface NormalisedPackageDetails {
    template: string
    name: PackageName
    description?: string
    links: PackageName[]
    devLinks: PackageName[]
    peerLinks: PackageName[]
    allLinks: PackageName[]
    guards: Record<GuardName, boolean>
    files: Record<ManagedFileName, any>
    meta: Record<string, any>
}