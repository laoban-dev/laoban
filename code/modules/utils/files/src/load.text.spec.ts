import {value} from "@laoban/errors";
import {nullObservability} from "@laoban/observability";

import {loadFromMarker, loadText} from "./load.text";
import {FileOpIssue, LoadTextConfig} from "./fileops";

const makeIssue = (message: string): FileOpIssue => ({
    kind: "unexpected",
    message,
    severity: "error",
    context: {
        operation: "load",
    },
});

describe("loadText", () => {
    const loadFile = jest.fn();
    const loadUrl = jest.fn();

    const config: LoadTextConfig = {
        observability: nullObservability(),
        markers: {
            "@laoban@": "/tmp/root",
            "@docs@": "https://example.com/docs",
        },
        loadFile,
        loadUrl,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("loads a plain file using loadFile", async () => {
        loadFile.mockResolvedValue(value("file text"));

        const result = await loadText("some/file.txt", config);

        expect(loadFile).toHaveBeenCalledWith("some/file.txt", expect.any(Object));
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual(value("file text"));
    });

    it("loads an http url using loadUrl", async () => {
        loadUrl.mockResolvedValue(value("url text"));

        const result = await loadText("http://example.com/a.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("http://example.com/a.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("url text"));
    });

    it("loads an https url using loadUrl", async () => {
        loadUrl.mockResolvedValue(value("secure url text"));

        const result = await loadText("https://example.com/a.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("https://example.com/a.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("secure url text"));
    });

    it("resolves a marker to a file and then loads it", async () => {
        loadFile.mockResolvedValue(value("marker file text"));

        const result = await loadText("@laoban@/templates/a.txt", config);

        expect(loadFile).toHaveBeenCalledWith("/tmp/root/templates/a.txt", expect.any(Object));
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual(value("marker file text"));
    });

    it("resolves a marker to a url and then loads it", async () => {
        loadUrl.mockResolvedValue(value("marker url text"));

        const result = await loadText("@docs@/guide.txt", config);

        expect(loadUrl).toHaveBeenCalledWith("https://example.com/docs/guide.txt", expect.any(Object));
        expect(loadFile).not.toHaveBeenCalled();
        expect(result).toEqual(value("marker url text"));
    });

    it("returns an unknownMarker error when the marker is not configured", async () => {
        const result = await loadText("@missing@/guide.txt", config);

        expect(loadFile).not.toHaveBeenCalled();
        expect(loadUrl).not.toHaveBeenCalled();
        expect(result).toEqual({
            errors: [
                {
                    kind: "unknownMarker",
                    message: "Unknown marker in source [@missing@/guide.txt]",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "@missing@/guide.txt",
                    },
                },
            ],
        });
    });

    it("uses defaults when config is omitted", async () => {
        const result = await loadText("plain.txt");

        expect("errors" in result).toBe(true);
    });

    it("passes through errors from loadFile", async () => {
        const fileError = {
            errors: [makeIssue("file failed")],
        };
        loadFile.mockResolvedValue(fileError);

        const result = await loadText("some/file.txt", config);

        expect(result).toEqual(fileError);
    });

    it("passes through errors from loadUrl", async () => {
        const urlError = {
            errors: [makeIssue("url failed")],
        };
        loadUrl.mockResolvedValue(urlError);

        const result = await loadText("https://example.com/f.txt", config);

        expect(result).toEqual(urlError);
    });
});

describe("loadFromMarker", () => {
    const loadFile = jest.fn();
    const loadUrl = jest.fn();

    const config: LoadTextConfig = {
        observability: nullObservability(),
        markers: {
            "@root@": "/workspace/root",
        },
        loadFile,
        loadUrl,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("recursively delegates to loadText after marker replacement", async () => {
        loadFile.mockResolvedValue(value("from marker"));

        const result = await loadFromMarker("@root@/x.txt", config);

        expect(loadFile).toHaveBeenCalledWith("/workspace/root/x.txt", expect.any(Object));
        expect(result).toEqual(value("from marker"));
    });

    it("returns unknownMarker when no configured marker matches", async () => {
        const result = await loadFromMarker("@other@/x.txt", config);

        expect(result).toEqual({
            errors: [
                {
                    kind: "unknownMarker",
                    message: "Unknown marker in source [@other@/x.txt]",
                    severity: "error",
                    context: {
                        operation: "load",
                        filename: "@other@/x.txt",
                    },
                },
            ],
        });
    });
});