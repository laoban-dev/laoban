import {errorsOrThrow, valueOrThrow} from "@laoban/errors";
import {normalisePackageDetails} from "./package.details.normalise";
import {NormalisedPackageDetails, PackageDetails} from "./package.details";
import {
    packageDetailsGraph,
    topologicallySortPackageDetails
} from "./package.details.sort";

function makeObservability() {
    return {
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
        timeService: {
            now: jest.fn(() => 1000)
        }
    } as any;
}

function pkg(details: PackageDetails): NormalisedPackageDetails {
    return normalisePackageDetails(details);
}

function byName(...packages: NormalisedPackageDetails[]): Record<string, NormalisedPackageDetails> {
    return Object.fromEntries(packages.map(p => [p.name, p]));
}

function namesByGeneration(generations: NormalisedPackageDetails[][]): string[][] {
    return generations.map(g => g.map(p => p.name));
}

describe("package.details.topological.sort", () => {
    describe("packageDetailsGraph", () => {
        it("uses allLinks as direct dependency names", () => {
            const c = pkg({name: "c", template: "t"});
            const b = pkg({name: "b", template: "t", devLinks: ["c"]});
            const a = pkg({name: "a", template: "t", links: ["b"]});

            expect(packageDetailsGraph.getName(a)).toBe("a");
            expect(packageDetailsGraph.dependsOn(a)).toEqual(["b"]);
            expect(packageDetailsGraph.dependsOn(b)).toEqual(["c"]);
            expect(packageDetailsGraph.dependsOn(c)).toEqual([]);
        });

        it("uses allLinks, so devLinks and peerLinks are included", () => {
            const a = pkg({
                name: "a",
                template: "t",
                links: ["b"],
                devLinks: ["c"],
                peerLinks: ["d"]
            });

            expect(packageDetailsGraph.dependsOn(a)).toEqual(["b", "c", "d"]);
        });
    });

    describe("topologicallySortPackageDetails", () => {
        it("returns one generation for independent packages in deterministic order", () => {
            const c = pkg({name: "c", template: "t"});
            const a = pkg({name: "a", template: "t"});
            const b = pkg({name: "b", template: "t"});

            const result = valueOrThrow(
                topologicallySortPackageDetails(
                    byName(c, a, b),
                    {
                        purpose: "package.details",
                        observability: makeObservability()
                    }
                )
            );

            expect(namesByGeneration(result)).toEqual([
                ["a", "b", "c"]
            ]);
        });

        it("sorts a simple dependency chain into generations", () => {
            const c = pkg({name: "c", template: "t"});
            const b = pkg({name: "b", template: "t", links: ["c"]});
            const a = pkg({name: "a", template: "t", links: ["b"]});

            const result = valueOrThrow(
                topologicallySortPackageDetails(
                    byName(a, b, c),
                    {
                        purpose: "package.details",
                        observability: makeObservability()
                    }
                )
            );

            expect(namesByGeneration(result)).toEqual([
                ["c"],
                ["b"],
                ["a"]
            ]);
        });

        it("puts siblings that share a dependency in the same generation", () => {
            const core = pkg({name: "core", template: "t"});
            const a = pkg({name: "a", template: "t", links: ["core"]});
            const b = pkg({name: "b", template: "t", links: ["core"]});

            const result = valueOrThrow(
                topologicallySortPackageDetails(
                    byName(b, core, a),
                    {
                        purpose: "package.details",
                        observability: makeObservability()
                    }
                )
            );

            expect(namesByGeneration(result)).toEqual([
                ["core"],
                ["a", "b"]
            ]);
        });

        it("uses allLinks, so devLinks affect ordering", () => {
            const shared = pkg({name: "shared", template: "t"});
            const app = pkg({name: "app", template: "t", devLinks: ["shared"]});

            const result = valueOrThrow(
                topologicallySortPackageDetails(
                    byName(app, shared),
                    {
                        purpose: "package.details",
                        observability: makeObservability()
                    }
                )
            );

            expect(namesByGeneration(result)).toEqual([
                ["shared"],
                ["app"]
            ]);
        });

        it("returns missingGraphDependency when a dependency is absent", () => {
            const a = pkg({name: "a", template: "t", links: ["missing"]});

            expect(
                errorsOrThrow(
                    topologicallySortPackageDetails(
                        byName(a),
                        {
                            purpose: "package.details",
                            observability: makeObservability()
                        }
                    )
                )
            ).toEqual([
                {
                    kind: "missingGraphDependency",
                    message: "Missing graph dependency in package.details: 'a' depends on 'missing' but it is not present",
                    context: {
                        purpose: "package.details",
                        nodeName: "a",
                        missingDependencyName: "missing"
                    }
                }
            ]);
        });

        it("returns missingGraphDependency when a devLink is absent", () => {
            const a = pkg({name: "a", template: "t", devLinks: ["dev-missing"]});

            expect(
                errorsOrThrow(
                    topologicallySortPackageDetails(
                        byName(a),
                        {
                            purpose: "package.details",
                            observability: makeObservability()
                        }
                    )
                )
            ).toEqual([
                {
                    kind: "missingGraphDependency",
                    message: "Missing graph dependency in package.details: 'a' depends on 'dev-missing' but it is not present",
                    context: {
                        purpose: "package.details",
                        nodeName: "a",
                        missingDependencyName: "dev-missing"
                    }
                }
            ]);
        });

        it("returns missingGraphDependency when a peerLink is absent", () => {
            const a = pkg({name: "a", template: "t", peerLinks: ["peer-missing"]});

            expect(
                errorsOrThrow(
                    topologicallySortPackageDetails(
                        byName(a),
                        {
                            purpose: "package.details",
                            observability: makeObservability()
                        }
                    )
                )
            ).toEqual([
                {
                    kind: "missingGraphDependency",
                    message: "Missing graph dependency in package.details: 'a' depends on 'peer-missing' but it is not present",
                    context: {
                        purpose: "package.details",
                        nodeName: "a",
                        missingDependencyName: "peer-missing"
                    }
                }
            ]);
        });

        it("returns graphCycle for cyclic dependencies", () => {
            const a = pkg({name: "a", template: "t", links: ["b"]});
            const b = pkg({name: "b", template: "t", links: ["a"]});

            expect(
                errorsOrThrow(
                    topologicallySortPackageDetails(
                        byName(a, b),
                        {
                            purpose: "package.details",
                            observability: makeObservability()
                        }
                    )
                )
            ).toEqual([
                {
                    kind: "graphCycle",
                    message: "Cycle detected in package.details: a -> b -> a",
                    context: {
                        purpose: "package.details",
                        cyclePath: ["a", "b", "a"]
                    }
                }
            ]);
        });
    });
});