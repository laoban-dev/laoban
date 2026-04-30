// function.and.args.ts

export type FunctionName = string
export type Arg = string

export type FunctionAndArgs = Readonly<{
    name: FunctionName
    args: Arg[]
}>

/**
 * Parses strings shaped like:
 *
 *   name()
 *   name(arg)
 *   name(arg1,arg2)
 *
 * Rules:
 * - function name must start with a letter or underscore
 * - function name may then contain letters, digits, or underscores
 * - arguments are separated by comma
 * - arguments may contain dots, slashes, spaces, colons, etc.
 * - arguments may not contain "," or ")"
 * - escaping is not supported
 *
 * Examples:
 *   pwd()                                      -> { name: "pwd", args: [] }
 *   cat(package.json)                         -> { name: "cat", args: ["package.json"] }
 *   tail(.log,50)                             -> { name: "tail", args: [".log", "50"] }
 *   cp(coverage/a.json,/tmp/pkg.name.json)    -> { name: "cp", args: ["coverage/a.json", "/tmp/pkg.name.json"] }
 */
export function toFunctionAndArgs(text: string): FunctionAndArgs {
    const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)$/)

    if (!match)
        throw new Error(`Command [${text}] does not match name(arg1,arg2,...)`)

    const [, name, rawArgs] = match

    return {
        name,
        args: rawArgs === "" ? [] : rawArgs.split(",")
    }
}

/**
 * Prints the parsed function command.
 *
 * Invariant for supported input:
 *
 *   fromFunctionAndArgs(toFunctionAndArgs(text)) === text
 *
 * This holds because arguments are preserved exactly and escaping is not
 * supported.
 */
export function fromFunctionAndArgs(functionAndArgs: FunctionAndArgs): string {
    return `${functionAndArgs.name}(${functionAndArgs.args.join(",")})`
}

export function hasFunctionName(
    functionAndArgs: FunctionAndArgs,
    name: FunctionName
): boolean {
    return functionAndArgs.name === name
}