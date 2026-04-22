import {
    ExecutionPlanPrettyPrintTypeClass,
    prettyPrintExecutionPlan
} from "./execution.plan.print";

interface TestItem {
    prefix: string;
    name: string;
    script: string;
}

const tc: ExecutionPlanPrettyPrintTypeClass<TestItem> = {
    prefix: item => item.prefix,
    name: item => item.name,
    script: item => item.script
};

describe("prettyPrintExecutionPlan", () => {
    it("prints generations with aligned name columns", () => {
        const plan: TestItem[][] = [
            [
                { prefix: "[0] ", name: "@laoban/clidsl", script: "tsc --noEmit false --outDir dist" },
                { prefix: "[0] ", name: "@laoban/scripts", script: "tsc --noEmit false --outDir dist" },
                { prefix: "[1] ", name: "@laoban/validation", script: "${packageManager} publish --access public" }
            ]
        ];

        expect(prettyPrintExecutionPlan(plan, tc)).toEqual(
            [
                "  Generation 0",
                "    - [0] @laoban/clidsl     tsc --noEmit false --outDir dist",
                "    - [0] @laoban/scripts    tsc --noEmit false --outDir dist",
                "    - [1] @laoban/validation ${packageManager} publish --access public",
                ""
            ].join("\n")
        );
    });

    it("prints multiple generations with blank lines between them", () => {
        const plan: TestItem[][] = [
            [
                { prefix: "[0] ", name: "alpha", script: "build" }
            ],
            [
                { prefix: "[1] ", name: "beta", script: "publish" }
            ]
        ];

        expect(prettyPrintExecutionPlan(plan, tc)).toEqual(
            [
                "  Generation 0",
                "    - [0] alpha build",
                "",
                "  Generation 1",
                "    - [1] beta  publish",
                ""
            ].join("\n")
        );
    });

    it("uses the custom generation label when provided", () => {
        const customTc: ExecutionPlanPrettyPrintTypeClass<TestItem> = {
            ...tc,
            generationLabel: index => `Wave ${index}`
        };

        const plan: TestItem[][] = [
            [
                { prefix: "[0] ", name: "alpha", script: "build" }
            ]
        ];

        expect(prettyPrintExecutionPlan(plan, customTc)).toEqual(
            [
                "  Wave 0",
                "    - [0] alpha build",
                ""
            ].join("\n")
        );
    });

    it("returns an empty string for an empty plan", () => {
        expect(prettyPrintExecutionPlan([], tc)).toEqual("");
    });

    it("handles empty generations", () => {
        const plan: TestItem[][] = [
            [],
            [
                { prefix: "[0] ", name: "alpha", script: "build" }
            ]
        ];

        expect(prettyPrintExecutionPlan(plan, tc)).toEqual(
            [
                "  Generation 0",
                "",
                "  Generation 1",
                "    - [0] alpha build",
                ""
            ].join("\n")
        );
    });

    it("uses the longest name across all generations for padding", () => {
        const plan: TestItem[][] = [
            [
                { prefix: "[0] ", name: "a", script: "build" }
            ],
            [
                { prefix: "[1] ", name: "long-package-name", script: "publish" }
            ]
        ];

        expect(prettyPrintExecutionPlan(plan, tc)).toEqual(
            [
                "  Generation 0",
                "    - [0] a                 build",
                "",
                "  Generation 1",
                "    - [1] long-package-name publish",
                ""
            ].join("\n")
        );
    });
});