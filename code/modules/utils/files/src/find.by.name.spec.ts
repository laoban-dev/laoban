import {errors, isErrors, value} from "@laoban/errors"
import {
    defaultFileOpsHelperConfig,
    defaultIgnoreDirectories,
    type FileOpIssue,
    type FileOpIssueContext,
    type FileOpsHelperDefaults,
    type WriteTextFn,
    makeFileOpIssue,
} from "./fileops"
import {findAllByNameUnder} from "./find.by.name"

const makeIssue = (
    currentFile: string,
    message: string,
    context?: FileOpIssueContext,
): FileOpIssue =>
    makeFileOpIssue(
        currentFile,
        "unexpected",
        message,
        context,
    )

const unusedWriteText: WriteTextFn = async filename =>
    errors(
        makeFileOpIssue(
            filename,
            "unexpected",
            `writeText should not be called while finding files: ${filename}`,
            {
                operation: "writeText",
                filename,
            },
        ),
    )

function makeDefaults(args: {
    fileExists: FileOpsHelperDefaults["infrastructure"]["fileExists"]
    listDirectory: FileOpsHelperDefaults["infrastructure"]["listDirectory"]
    ignoreDirectories?: string[]
}): FileOpsHelperDefaults {
    return {
        infrastructure: {
            fileExists: args.fileExists,
            listDirectory: args.listDirectory,
            writeText: unusedWriteText,
            pathOps: {
                dirname: directory => directory.split("/").slice(0, -1).join("/") || "/",
                resolvePath: path => path,
                joinPath: (directory, filename) =>
                    directory === "/" ? `/${filename}` : `${directory}/${filename}`,
            },
        },
        ...(args.ignoreDirectories === undefined ? {} : {ignoreDirectories: args.ignoreDirectories}),
    }
}

describe("findAllByNameUnder", () => {
    it("finds matching files recursively and returns them sorted", async () => {
        const directories: Record<string, string[]> = {
            "/root": ["b", "a"],
            "/root/a": ["package.details.json", "src"],
            "/root/a/src": ["package.details.json"],
            "/root/b": ["package.details.json"],
        }
        const files = new Set([
            "/root/a/package.details.json",
            "/root/a/src/package.details.json",
            "/root/b/package.details.json",
        ])

        const defaults = makeDefaults({
            fileExists: async filename => value(files.has(filename)),
            listDirectory: async directory => {
                const children = directories[directory]

                return children === undefined
                    ? errors(makeIssue(
                        directory,
                        `not a directory: ${directory}`,
                        {
                            operation: "listDirectory",
                            directory,
                        },
                    ))
                    : value(children)
            },
        })

        const actual = await findAllByNameUnder(defaults)("/root", "package.details.json")

        expect(actual).toEqual(value([
            "/root/a/package.details.json",
            "/root/a/src/package.details.json",
            "/root/b/package.details.json",
        ]))
    })

    it("skips ignored directories using defaults", async () => {
        const directories: Record<string, string[]> = {
            "/root": ["node_modules", ".git", "packages"],
            "/root/packages": ["a"],
            "/root/packages/a": ["package.details.json"],
            "/root/node_modules": ["ignored"],
            "/root/node_modules/ignored": ["package.details.json"],
            "/root/.git": ["ignored"],
            "/root/.git/ignored": ["package.details.json"],
        }
        const files = new Set([
            "/root/packages/a/package.details.json",
            "/root/node_modules/ignored/package.details.json",
            "/root/.git/ignored/package.details.json",
        ])

        const defaults = makeDefaults({
            fileExists: async filename => value(files.has(filename)),
            listDirectory: async directory => {
                const children = directories[directory]

                return children === undefined
                    ? errors(makeIssue(
                        directory,
                        `not a directory: ${directory}`,
                        {
                            operation: "listDirectory",
                            directory,
                        },
                    ))
                    : value(children)
            },
            ignoreDirectories: defaultIgnoreDirectories,
        })

        const actual = await findAllByNameUnder(defaults)("/root", "package.details.json")

        expect(actual).toEqual(value([
            "/root/packages/a/package.details.json",
        ]))
    })

    it("allows ignoreDirectories to be overridden", async () => {
        const directories: Record<string, string[]> = {
            "/root": ["node_modules", "packages"],
            "/root/packages": ["a"],
            "/root/packages/a": ["package.details.json"],
            "/root/node_modules": ["ignored"],
            "/root/node_modules/ignored": ["package.details.json"],
        }
        const files = new Set([
            "/root/packages/a/package.details.json",
            "/root/node_modules/ignored/package.details.json",
        ])

        const defaults = makeDefaults({
            fileExists: async filename => value(files.has(filename)),
            listDirectory: async directory => {
                const children = directories[directory]

                return children === undefined
                    ? errors(makeIssue(
                        directory,
                        `not a directory: ${directory}`,
                        {
                            operation: "listDirectory",
                            directory,
                        },
                    ))
                    : value(children)
            },
        })

        const actual = await findAllByNameUnder(defaults)(
            "/root",
            "package.details.json",
            {ignoreDirectories: []},
        )

        expect(actual).toEqual(value([
            "/root/node_modules/ignored/package.details.json",
            "/root/packages/a/package.details.json",
        ]))
    })

    it("returns empty when no matching files are found", async () => {
        const directories: Record<string, string[]> = {
            "/root": ["a"],
            "/root/a": ["src"],
            "/root/a/src": [],
        }

        const defaults = makeDefaults({
            fileExists: async () => value(false),
            listDirectory: async directory => {
                const children = directories[directory]

                return children === undefined
                    ? errors(makeIssue(
                        directory,
                        `not a directory: ${directory}`,
                        {
                            operation: "listDirectory",
                            directory,
                        },
                    ))
                    : value(children)
            },
        })

        const actual = await findAllByNameUnder(defaults)("/root", "package.details.json")

        expect(actual).toEqual(value([]))
    })

    it("propagates an error when the root directory cannot be listed", async () => {
        const rootError = errors<FileOpIssue>(
            makeFileOpIssue(
                "/root",
                "io",
                "cannot list root",
                {
                    operation: "listDirectory",
                    directory: "/root",
                },
            ),
        )

        const defaults = makeDefaults({
            fileExists: async () => value(false),
            listDirectory: async directory =>
                directory === "/root" ? rootError : value([]),
        })

        const actual = await findAllByNameUnder(defaults)("/root", "package.details.json")

        expect(actual).toEqual(rootError)
    })

    it("propagates an error when fileExists fails", async () => {
        const existsError = errors<FileOpIssue>(
            makeFileOpIssue(
                "/root/package.details.json",
                "io",
                "cannot stat file",
                {
                    operation: "fileExists",
                    filename: "/root/package.details.json",
                },
            ),
        )

        const directories: Record<string, string[]> = {
            "/root": [],
        }

        const defaults = makeDefaults({
            fileExists: async filename =>
                filename === "/root/package.details.json" ? existsError : value(false),
            listDirectory: async directory => {
                const children = directories[directory]

                return children === undefined
                    ? errors(makeIssue(
                        directory,
                        `not a directory: ${directory}`,
                        {
                            operation: "listDirectory",
                            directory,
                        },
                    ))
                    : value(children)
            },
        })

        const actual = await findAllByNameUnder(defaults)("/root", "package.details.json")

        expect(actual).toEqual(existsError)
    })

    it("uses defaultFileOpsHelperConfig defaults when config is omitted", async () => {
        const directories: Record<string, string[]> = {
            "/root": ["a"],
            "/root/a": ["package.details.json"],
        }
        const files = new Set(["/root/a/package.details.json"])

        const defaults = makeDefaults({
            fileExists: async filename => value(files.has(filename)),
            listDirectory: async directory => {
                const children = directories[directory]

                return children === undefined
                    ? errors(makeIssue(
                        directory,
                        `not a directory: ${directory}`,
                        {
                            operation: "listDirectory",
                            directory,
                        },
                    ))
                    : value(children)
            },
        })

        const expectedConfig = defaultFileOpsHelperConfig(defaults, {})
        expect(expectedConfig.ignoreDirectories).toEqual([".git", "node_modules"])

        const actual = await findAllByNameUnder(defaults)("/root", "package.details.json")

        expect(isErrors(actual)).toBe(false)
        expect(actual).toEqual(value(["/root/a/package.details.json"]))
    })
})