import {Writable} from "node:stream"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {DirectoryName, ExecutorFn, ExitCode, toFunctionAndArgs} from "@laoban/execution"
import {Env} from "@laoban/records";

export type FileCommandName = string

export type FileCommandFn = (
    cwd: DirectoryName,
    args: string[],
    env: Env,
    writable: Writable
) => Promise<ExitCode>

export type FileCommands = Record<FileCommandName, FileCommandFn>

export function writeString(
    writable: Writable,
    text: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        writable.write(text, error => {
            if (error) reject(error)
            else resolve()
        })
    })
}

export function resolveInCwd(
    cwd: DirectoryName,
    fileName: string
): string {
    return path.isAbsolute(fileName)
        ? fileName
        : path.join(cwd, fileName)
}

export async function existsPath(fileName: string): Promise<boolean> {
    try {
        await fs.stat(fileName)
        return true
    } catch {
        return false
    }
}

export async function isFile(fileName: string): Promise<boolean> {
    try {
        return (await fs.stat(fileName)).isFile()
    } catch {
        return false
    }
}

export async function isDirectory(fileName: string): Promise<boolean> {
    try {
        return (await fs.stat(fileName)).isDirectory()
    } catch {
        return false
    }
}

export function requireArg(
    commandName: FileCommandName,
    args: string[],
    index: number
): string {
    const arg = args[index]

    if (arg === undefined || arg === "")
        throw new Error(`file:${commandName} requires argument ${index + 1}`)

    return arg
}

export function requireArgCount(
    commandName: FileCommandName,
    args: string[],
    expected: number
): void {
    if (args.length !== expected)
        throw new Error(`file:${commandName} requires ${expected} argument(s). Got ${args.length}`)
}

export function requireArgCountBetween(
    commandName: FileCommandName,
    args: string[],
    min: number,
    max: number
): void {
    if (args.length < min || args.length > max)
        throw new Error(`file:${commandName} requires between ${min} and ${max} argument(s). Got ${args.length}`)
}

export const pwd: FileCommandFn = async (cwd, args, _env, writable) => {
    requireArgCount("pwd", args, 0)
    await writeString(writable, `${cwd}\n`)
    return 0
}

export const exists: FileCommandFn = async (cwd, args, _env, writable) => {
    requireArgCount("exists", args, 1)
    const target = resolveInCwd(cwd, requireArg("exists", args, 0))
    await writeString(writable, `${await existsPath(target)}\n`)
    return 0
}

export const rm: FileCommandFn = async (cwd, args) => {
    requireArgCount("rm", args, 1)
    const target = resolveInCwd(cwd, requireArg("rm", args, 0))

    if (await isFile(target))
        await fs.rm(target)

    return 0
}

export const rmDir: FileCommandFn = async (cwd, args) => {
    requireArgCount("rmDir", args, 1)
    const target = resolveInCwd(cwd, requireArg("rmDir", args, 0))

    if (await isDirectory(target))
        await fs.rm(target, {recursive: true, force: true})

    return 0
}

export const mkdir: FileCommandFn = async (cwd, args) => {
    requireArgCount("mkdir", args, 1)
    const target = resolveInCwd(cwd, requireArg("mkdir", args, 0))
    await fs.mkdir(target, {recursive: true})
    return 0
}

export const cat: FileCommandFn = async (cwd, args, _env, writable) => {
    requireArgCount("cat", args, 1)
    const target = resolveInCwd(cwd, requireArg("cat", args, 0))

    if (await isFile(target))
        await writeString(writable, await fs.readFile(target, "utf8"))

    return 0
}
export const tail: FileCommandFn = async (cwd, args, _env, writable) => {
    requireArgCountBetween("tail", args, 1, 2)

    const target = resolveInCwd(cwd, requireArg("tail", args, 0))
    const rawTailSize = args[1]
    const tailSize = rawTailSize === undefined
        ? 10
        : Number.parseInt(rawTailSize, 10)

    if (!Number.isInteger(tailSize) || tailSize < 0)
        throw new Error(`file:tail argument 2 must be a non-negative integer. Was [${rawTailSize}]`)

    if (tailSize === 0)
        return 0

    if (await isFile(target)) {
        const file = await fs.readFile(target, "utf8")
        await writeString(writable, file.split("\n").slice(-tailSize).join("\n"))
    }

    return 0
}

export const cp: FileCommandFn = async (cwd, args) => {
    requireArgCount("cp", args, 2)

    const from = resolveInCwd(cwd, requireArg("cp", args, 0))
    const to = resolveInCwd(cwd, requireArg("cp", args, 1))

    await fs.mkdir(path.dirname(to), {recursive: true})
    await fs.copyFile(from, to)

    return 0
}

export const defaultFileCommands: FileCommands = {
    pwd,
    exists,
    rm,
    rmDir,
    mkdir,
    cat,
    tail,
    cp
}

export function makeFileExecutor(
    fileCommands: FileCommands = defaultFileCommands
): ExecutorFn<Writable> {
    return async (
        command,
        cwd,
        env,
        writable,
        _observability
    ): Promise<ExitCode> => {
        const parsed = toFunctionAndArgs(command)
        const fileCommand = fileCommands[parsed.name]

        if (!fileCommand)
            throw new Error(
                `Unknown file command ${parsed.name}. Known commands are ${Object.keys(fileCommands).join(", ")}`
            )

        return fileCommand(cwd, parsed.args, env, writable)
    }
}