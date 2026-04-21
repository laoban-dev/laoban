import {
    prettyPrintGenerationsLinear,
    prettyPrintGenerationsSwimlanes,
    prettyPrintGenerationsVertical
} from "./topological.sort.print";

type T = { name: string };

const tc = {
    getName: (x: T) => x.name
};

describe("prettyPrintGenerationsLinear", () => {
    it("prints empty generations", () => {
        expect(
            prettyPrintGenerationsLinear([], tc)
        ).toEqual("[]");
    });

    it("prints single generation", () => {
        const gens = [
            [{ name: "a" }, { name: "b" }]
        ];

        expect(
            prettyPrintGenerationsLinear(gens, tc)
        ).toEqual(JSON.stringify([["a", "b"]], null, 2));
    });

    it("prints multiple generations", () => {
        const gens = [
            [{ name: "a" }],
            [{ name: "b" }, { name: "c" }]
        ];

        expect(
            prettyPrintGenerationsLinear(gens, tc)
        ).toEqual(
            JSON.stringify(
                [
                    ["a"],
                    ["b", "c"]
                ],
                null,
                2
            )
        );
    });

    it("prints empty inner generations", () => {
        const gens = [
            [],
            [{ name: "b" }]
        ];

        expect(
            prettyPrintGenerationsLinear(gens, tc)
        ).toEqual(
            JSON.stringify(
                [
                    [],
                    ["b"]
                ],
                null,
                2
            )
        );
    });

    it("preserves generation order", () => {
        const gens = [
            [{ name: "gen1a" }, { name: "gen1b" }],
            [{ name: "gen2a" }],
            [{ name: "gen3a" }, { name: "gen3b" }]
        ];

        expect(
            prettyPrintGenerationsLinear(gens, tc)
        ).toEqual(
            JSON.stringify(
                [
                    ["gen1a", "gen1b"],
                    ["gen2a"],
                    ["gen3a", "gen3b"]
                ],
                null,
                2
            )
        );
    });
});

describe("prettyPrintGenerationsSwimlanes", () => {
    it("prints empty as empty string", () => {
        expect(
            prettyPrintGenerationsSwimlanes([], tc)
        ).toEqual("");
    });

    it("prints single generation vertically", () => {
        const gens = [
            [{ name: "a" }, { name: "b" }]
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `a
b`
        );
    });

    it("prints multiple generations in columns", () => {
        const gens = [
            [{ name: "core" }],
            [{ name: "api" }, { name: "util" }],
            [{ name: "app" }, { name: "tests" }, { name: "docs" }]
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `core  api   app
      util  tests
            docs`
        );
    });

    it("pads columns based on max width per generation", () => {
        const gens = [
            [{ name: "a" }],
            [{ name: "longname" }, { name: "b" }]
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `a  longname
   b`
        );
    });

    it("handles uneven generation sizes", () => {
        const gens = [
            [{ name: "a" }, { name: "b" }, { name: "c" }],
            [{ name: "x" }]
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `a  x
b
c`
        );
    });

    it("trims trailing whitespace on lines", () => {
        const gens = [
            [{ name: "a" }],
            []
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `a`
        );
    });

    it("handles empty generations between non-empty generations", () => {
        const gens = [
            [{ name: "a" }, { name: "b" }],
            [],
            [{ name: "x" }]
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `a    x
b`
        );
    });

    it("pads each generation independently", () => {
        const gens = [
            [{ name: "short" }, { name: "loooooong" }],
            [{ name: "x" }, { name: "yy" }]
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `short      x
loooooong  yy`
        );
    });

    it("handles many empty rows after first generation", () => {
        const gens = [
            [{ name: "a" }, { name: "b" }, { name: "c" }],
            [],
            []
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual(
            `a
b
c`
        );
    });

    it("prints empty string when all generations are empty", () => {
        const gens = [
            [],
            []
        ];

        expect(
            prettyPrintGenerationsSwimlanes(gens, tc)
        ).toEqual("");
    });
});

describe("prettyPrintGenerationsVertical", () => {
    it("prints empty as empty string", () => {
        expect(
            prettyPrintGenerationsVertical([], tc)
        ).toEqual("");
    });

    it("prints a single generation horizontally", () => {
        const gens = [
            [{ name: "a" }, { name: "b" }, { name: "c" }]
        ];

        expect(
            prettyPrintGenerationsVertical(gens, tc)
        ).toEqual("a  b  c");
    });

    it("prints multiple generations in rows", () => {
        const gens = [
            [{ name: "core" }],
            [{ name: "api" }, { name: "util" }],
            [{ name: "app" }, { name: "tests" }, { name: "docs" }]
        ];

        expect(
            prettyPrintGenerationsVertical(gens, tc)
        ).toEqual(
            `core
api   util
app   tests  docs`
        );
    });

    it("pads columns based on max width per index", () => {
        const gens = [
            [{ name: "a" }, { name: "longname" }],
            [{ name: "bbbb" }, { name: "x" }]
        ];

        expect(
            prettyPrintGenerationsVertical(gens, tc)
        ).toEqual(
            `a     longname
bbbb  x`
        );
    });

    it("handles uneven generation sizes", () => {
        const gens = [
            [{ name: "a" }, { name: "bb" }, { name: "ccc" }],
            [{ name: "dddd" }]
        ];

        expect(
            prettyPrintGenerationsVertical(gens, tc)
        ).toEqual(
            `a     bb  ccc
dddd`
        );
    });

    it("handles empty generations between non-empty generations", () => {
        const gens = [
            [{ name: "a" }, { name: "bb" }],
            [],
            [{ name: "cccc" }]
        ];

        expect(
            prettyPrintGenerationsVertical(gens, tc)
        ).toEqual(
            `a     bb

cccc`
        );
    });

    it("trims trailing whitespace on each line", () => {
        const gens = [
            [{ name: "abc" }],
            [{ name: "x" }, { name: "yy" }]
        ];

        expect(
            prettyPrintGenerationsVertical(gens, tc)
        ).toEqual(
            `abc
x    yy`
        );
    });

    it("prints empty lines for empty generations", () => {
        const gens = [
            [],
            [{ name: "x" }]
        ];

        expect(
            prettyPrintGenerationsVertical(gens, tc)
        ).toEqual(
            `
x`
        );
    });
});