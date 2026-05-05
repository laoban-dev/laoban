import {errors, isErrors, value, valueOrThrow} from "@laoban/errors"
import {loadAndWalkPackageDetails, LoadAndWalkConfig, PackageWalkerInput} from "./package.details.load.and.walk"

describe("loadAndWalkPackageDetails", () => {
    const start = "/workspace" as any

    const laobanConfigLoadConfig = {
        fileOps: {},
        osOps: {},
        loadTextConfig: {},
        observability: {},
        markerFileName: "laoban.json",
    } as any

    const loadedConfig = {
        config: {},
        directory: "/workspace",
    } as any

    const alpha = {
        packageFile: "/workspace/packages/alpha/package.details.json",
        dir: "/workspace/packages/alpha",
        contents: {
            template: "default",
            name: "alpha",
            links: [],
            devLinks: [],
            peerLinks: [],
            allLinks: [],
            guards: {},
            files: {},
            meta: {},
        },
    } as any

    const beta = {
        packageFile: "/workspace/packages/beta/package.details.json",
        dir: "/workspace/packages/beta",
        contents: {
            template: "default",
            name: "beta",
            links: [],
            devLinks: [],
            peerLinks: [],
            allLinks: [],
            guards: {},
            files: {},
            meta: {},
        },
    } as any

    const loadedProject = {
        loadedLaobanConfig: loadedConfig,
        loadedPackageDetails: {
            alpha,
            beta,
        },
    } as any

    function makeConfig(overrides: Partial<LoadAndWalkConfig> = {}): LoadAndWalkConfig {
        return {
            laobanConfigLoadConfig,
            loadConfig: jest.fn(async () => value(loadedConfig)) as any,
            loadPackages: jest.fn(async () => value(loadedProject)) as any,
            ...overrides,
        }
    }

    function expectedInput(loadedPackageDetail: any): PackageWalkerInput {
        return {
            loadedConfig,
            loadedProject,
            loadedPackageDetail,
        }
    }

    it("loads config, loads packages, and visits each loaded package detail", async () => {
        const config = makeConfig()
        const visit = jest.fn(async ({loadedPackageDetail}: PackageWalkerInput) =>
            value(loadedPackageDetail.contents.name),
        )

        const result = await loadAndWalkPackageDetails(config, start, visit)

        expect(valueOrThrow(result)).toEqual(["alpha", "beta"])

        expect(config.loadConfig).toHaveBeenCalledTimes(1)
        expect(config.loadConfig).toHaveBeenCalledWith(laobanConfigLoadConfig, start)

        expect(config.loadPackages).toHaveBeenCalledTimes(1)
        expect(config.loadPackages).toHaveBeenCalledWith(loadedConfig, laobanConfigLoadConfig)

        expect(visit).toHaveBeenCalledTimes(2)
        expect(visit).toHaveBeenNthCalledWith(1, expectedInput(alpha))
        expect(visit).toHaveBeenNthCalledWith(2, expectedInput(beta))
    })

    it("returns config load errors and does not load packages or visit packages", async () => {
        const issue = {kind: "loadConfigFailed", message: "Could not load config"}
        const config = makeConfig({
            loadConfig: jest.fn(async () => errors(issue)) as any,
        })
        const visit = jest.fn(async () => value("should not happen"))

        const result = await loadAndWalkPackageDetails(config, start, visit)

        expect(result).toEqual(errors(issue))
        expect(config.loadConfig).toHaveBeenCalledTimes(1)
        expect(config.loadPackages).not.toHaveBeenCalled()
        expect(visit).not.toHaveBeenCalled()
    })

    it("returns package load errors and does not visit packages", async () => {
        const issue = {kind: "loadPackagesFailed", message: "Could not load packages"}
        const config = makeConfig({
            loadPackages: jest.fn(async () => errors(issue)) as any,
        })
        const visit = jest.fn(async () => value("should not happen"))

        const result = await loadAndWalkPackageDetails(config, start, visit)

        expect(result).toEqual(errors(issue))
        expect(config.loadConfig).toHaveBeenCalledTimes(1)
        expect(config.loadPackages).toHaveBeenCalledTimes(1)
        expect(visit).not.toHaveBeenCalled()
    })

    it("aggregates package visit errors", async () => {
        const alphaIssue = {kind: "alphaFailed", message: "Alpha failed"}
        const betaIssue = {kind: "betaFailed", message: "Beta failed"}

        const config = makeConfig()
        const visit = jest.fn(async ({loadedPackageDetail}: PackageWalkerInput) =>
            loadedPackageDetail.contents.name === "alpha"
                ? errors(alphaIssue)
                : errors(betaIssue),
        )

        const result = await loadAndWalkPackageDetails(config, start, visit)

        expect(isErrors(result)).toBe(true)
        expect(result).toEqual({
            errors: [alphaIssue, betaIssue],
        })
        expect(visit).toHaveBeenCalledTimes(2)
    })

    it("aggregates successful package visit values", async () => {
        const config = makeConfig()
        const visit = jest.fn(async ({loadedPackageDetail}: PackageWalkerInput) =>
            value({
                packageName: loadedPackageDetail.contents.name,
                dir: loadedPackageDetail.dir,
            }),
        )

        const result = await loadAndWalkPackageDetails(config, start, visit)

        expect(valueOrThrow(result)).toEqual([
            {
                packageName: "alpha",
                dir: "/workspace/packages/alpha",
            },
            {
                packageName: "beta",
                dir: "/workspace/packages/beta",
            },
        ])
    })
})