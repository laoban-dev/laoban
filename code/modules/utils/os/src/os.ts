export type CpuCount = () => number

export interface OsOps {
    cpuCount: CpuCount
}
