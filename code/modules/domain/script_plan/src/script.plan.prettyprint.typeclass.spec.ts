import { LoadedPackageDetail, normalisePackageDetails } from "@laoban/package_details";
import { scriptExecutionPlanPrettyPrintTypeClass, ScriptExecutionItem } from "./script.plan";

function pkg(name: string): LoadedPackageDetail {
    return {
        packageFile: `/repo/${name}/package.details.json`,
        dir: `/repo/${name}`,
        contents: normalisePackageDetails({
            template: "default",
            name
        })
    };
}

describe("scriptExecutionPlanPrettyPrintTypeClass", () => {
    it("prints the step index as the prefix", () => {
        const item: ScriptExecutionItem = {
            kind: "eachPackage",
            stepIndex: 7,
            command: {
                command: "tsc --noEmit false --outDir dist",
                status: true,
                executionScope: "eachPackage"
            },
            pkg: pkg("@laoban/scripts")
        };

        expect(scriptExecutionPlanPrettyPrintTypeClass.prefix(item)).toEqual("[7] ");
    });

    it("uses the package name for eachPackage items", () => {
        const item: ScriptExecutionItem = {
            kind: "eachPackage",
            stepIndex: 0,
            command: {
                command: "build",
                status: true,
                executionScope: "eachPackage"
            },
            pkg: pkg("@laoban/package_details")
        };

        expect(scriptExecutionPlanPrettyPrintTypeClass.name(item)).toEqual("@laoban/package_details");
    });

    it("uses workspace for oncePerWorkSpace items", () => {
        const item: ScriptExecutionItem = {
            kind: "oncePerWorkSpace",
            stepIndex: 1,
            command: {
                command: "${packageManager} publish --access public",
                status: true,
                executionScope: "oncePerWorkSpace"
            }
        };

        expect(scriptExecutionPlanPrettyPrintTypeClass.name(item)).toEqual("workspace");
    });

    it("uses the command text for the script column", () => {
        const item: ScriptExecutionItem = {
            kind: "eachPackage",
            stepIndex: 2,
            command: {
                command: "${packageManager} publish --access public",
                status: true,
                executionScope: "eachPackage"
            },
            pkg: pkg("@laoban/files")
        };

        expect(scriptExecutionPlanPrettyPrintTypeClass.script(item)).toEqual("${packageManager} publish --access public");
    });
});