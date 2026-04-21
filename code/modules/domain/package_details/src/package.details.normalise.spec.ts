import {type PackageDetails} from "./package.details";
import {normalisePackageDetails} from "./package.details.normalise";

describe("normalisePackageDetails", () => {
    it("should default missing optional fields", () => {
        const details: PackageDetails = {
            template: "typescript",
            name: "@laoban/example"
        };

        expect(normalisePackageDetails(details)).toEqual({
            template: "typescript",
            name: "@laoban/example",
            description: undefined,
            links: [],
            devLinks: [],
            peerLinks: [],
            allLinks: [],
            guards: {},
            files: {},
            meta: {}
        });
    });

    it("should preserve provided fields", () => {
        const details: PackageDetails = {
            template: "typescript",
            name: "@laoban/example",
            description: "some description",
            links: ["a", "b"],
            devLinks: ["c"],
            peerLinks: ["d"],
            guards: {compile: true, test: false},
            files: {"package.json": {scripts: {test: "jest"}}},
            meta: {owner: "team-a"}
        };

        expect(normalisePackageDetails(details)).toEqual({
            template: "typescript",
            name: "@laoban/example",
            description: "some description",
            links: ["a", "b"],
            devLinks: ["c"],
            peerLinks: ["d"],
            allLinks: ["a", "b", "c", "d"],
            guards: {compile: true, test: false},
            files: {"package.json": {scripts: {test: "jest"}}},
            meta: {owner: "team-a"}
        });
    });

    it("should calculate allLinks from all three link collections", () => {
        const details: PackageDetails = {
            template: "typescript",
            name: "@laoban/example",
            links: ["a", "b"],
            devLinks: ["c"],
            peerLinks: ["d", "e"]
        };

        expect(normalisePackageDetails(details).allLinks).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("should de-duplicate allLinks while preserving first occurrence order", () => {
        const details: PackageDetails = {
            template: "typescript",
            name: "@laoban/example",
            links: ["a", "b", "a"],
            devLinks: ["b", "c"],
            peerLinks: ["c", "d", "a"]
        };

        expect(normalisePackageDetails(details)).toEqual({
            template: "typescript",
            name: "@laoban/example",
            description: undefined,
            links: ["a", "b", "a"],
            devLinks: ["b", "c"],
            peerLinks: ["c", "d", "a"],
            allLinks: ["a", "b", "c", "d"],
            guards: {},
            files: {},
            meta: {}
        });
    });

    it("should not mutate the input object", () => {
        const details: PackageDetails = {
            template: "typescript",
            name: "@laoban/example",
            links: ["a"],
            devLinks: ["b"],
            peerLinks: ["c"],
            guards: {compile: true},
            files: {"package.json": {scripts: {test: "jest"}}},
            meta: {owner: "team-a"}
        };

        const copyBefore = JSON.parse(JSON.stringify(details));
        normalisePackageDetails(details);

        expect(details).toEqual(copyBefore);
    });
});