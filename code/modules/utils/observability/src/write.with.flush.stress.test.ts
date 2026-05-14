import {isErrors, value} from "@laoban/errors"
import {
    ChannelTc,
    emptyChannelState,
    flush,
    flushAllTouchedChannels,
    getOrCreateChannels,
    syncWriteTo,
} from "./write.with.flush"
import {ModuleName, ModuleObservabilityScope} from "./observability"

const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

type Purpose = "log"
type Ref = string

type FakeChannel = {
    ref: Ref
    writes: string[]
    closed?: boolean
    composed?: boolean
    children?: FakeChannel[]
}

const scope = (
    module: ModuleName,
    directory: string = String(module ?? "root"),
): ModuleObservabilityScope => ({
    module,
    directory,
})

const valueOrThrow = <T,>(result: any): T => {
    if (isErrors(result)) throw new Error(JSON.stringify(result))
    return result.value
}

const makeFakeTc = () => {
    const durable: Record<Ref, string[]> = {}

    const tc: ChannelTc<Purpose, never, FakeChannel, Ref> = {
        reference: moduleScope => () => moduleScope.directory,

        keyFrom: moduleScope => moduleScope.module ?? "root",

        create: async (ref, opts) => {
            if (!opts.append) durable[ref] = []
            else durable[ref] = durable[ref] ?? []

            return value({ref, writes: []})
        },

        composeWritables: channels => ({
            ref: `composed(${channels.map(c => c.ref).join(",")})`,
            writes: [],
            composed: true,
            children: channels,
        }),

        write: async (channel, text) => {
            await delay(Math.floor(Math.random() * 5))

            if (channel.composed) {
                for (const child of channel.children ?? []) {
                    child.writes.push(text)
                    durable[child.ref] = durable[child.ref] ?? []
                    durable[child.ref].push(text)
                }

                channel.writes.push(text)
                return value(undefined)
            }

            channel.writes.push(text)
            durable[channel.ref] = durable[channel.ref] ?? []
            durable[channel.ref].push(text)
            return value(undefined)
        },

        closeReadable: async () => value(undefined),

        closeWritable: async channel => {
            channel.closed = true
            return value(undefined)
        },

        sendFromRefToWrite: async (ref, from, write) => {
            const allText = (durable[ref] ?? []).join("")
            const delta = allText.slice(from)

            if (delta.length > 0)
                write.writes.push(delta)

            return value(allText.length)
        },
    }

    return {tc, durable}
}

const makeState = (
    tc: ChannelTc<Purpose, never, FakeChannel, Ref>,
) =>
    emptyChannelState<Purpose, never, FakeChannel, Ref>(
        tc,
        ["log"],
        e => {
            throw new Error(JSON.stringify(e))
        },
    )

const makeModuleWriters = async (
    state: ReturnType<typeof makeState>,
    moduleScopes: ModuleObservabilityScope[],
) => {
    const writers = new Map<string, (text: string) => void | Promise<void>>()

    for (const moduleScope of moduleScopes) {
        const channels = valueOrThrow<FakeChannel[]>(
            await getOrCreateChannels(state, moduleScope),
        )

        const composed = state.tc.composeWritables(channels, state.onError)
        const write = syncWriteTo(state)(moduleScope)(composed)

        writers.set(String(moduleScope.module ?? "root"), write)
    }

    return writers
}

describe("stress: async logging does not lose messages", () => {
    it("writes M messages across N modules over multiple explicit module flush cycles", async () => {
        const N = 50
        const M = 20
        const cycles = 100

        const {tc, durable} = makeFakeTc()
        const state = makeState(tc)

        const modules = Array.from({length: N}, (_, i) => `module-${i}`)
        const moduleScopes = modules.map(module => scope(module, module))
        const writers = await makeModuleWriters(state, moduleScopes)

        const flushedByCycle: string[][] = []

        for (let c = 0; c < cycles; c++) {
            await Promise.all(
                moduleScopes.flatMap(moduleScope =>
                    Array.from({length: M}, async (_, i) => {
                        await delay(Math.floor(Math.random() * 5))

                        const write = writers.get(String(moduleScope.module))!
                        write(`msg ${c}-${i}\n`)
                    }),
                ),
            )

            const flushed: string[] = []
            const out: FakeChannel = {ref: `stdout-${c}`, writes: flushed}

            const results = await Promise.all(
                moduleScopes.map(moduleScope =>
                    flush(state)(moduleScope)(out),
                ),
            )

            expect(results).toEqual(modules.map(() => value(undefined)))
            flushedByCycle.push([...flushed])
        }

        for (const module of modules) {
            const moduleScope = scope(module, module)
            const ref = tc.reference(moduleScope)("log")

            expect(durable[ref]).toHaveLength(M * cycles)

            const expected = new Set(
                Array.from({length: cycles}).flatMap((_, c) =>
                    Array.from({length: M}, (_, i) => `msg ${c}-${i}\n`),
                ),
            )

            expect(new Set(durable[ref])).toEqual(expected)
        }

        for (let c = 0; c < cycles; c++) {
            const flushedText = flushedByCycle[c].join("")
            const flushedLines = flushedText
                .split("\n")
                .filter(line => line.length > 0)

            expect(flushedLines).toHaveLength(N * M)

            const expected = new Set(
                Array.from({length: N}).flatMap(() =>
                    Array.from({length: M}, (_, i) => `msg ${c}-${i}`),
                ),
            )

            expect(new Set(flushedLines)).toEqual(expected)
        }
    })

    it("writes M messages across N modules over multiple flushAllTouchedChannels cycles", async () => {
        const N = 50
        const M = 20
        const cycles = 100

        const {tc, durable} = makeFakeTc()
        const state = makeState(tc)

        const modules = Array.from({length: N}, (_, i) => `module-${i}`)
        const moduleScopes = modules.map(module => scope(module, module))
        const writers = await makeModuleWriters(state, moduleScopes)

        for (let c = 0; c < cycles; c++) {
            await Promise.all(
                moduleScopes.flatMap(moduleScope =>
                    Array.from({length: M}, async (_, i) => {
                        await delay(Math.floor(Math.random() * 5))

                        const write = writers.get(String(moduleScope.module))!
                        write(`msg ${c}-${i}\n`)
                    }),
                ),
            )

            const out: FakeChannel = {ref: `stdout-${c}`, writes: []}

            const result = await flushAllTouchedChannels(state)(out)

            expect(result).toEqual(value(undefined))

            const flushedLines = out.writes
                .join("")
                .split("\n")
                .filter(line => line.length > 0)

            expect(flushedLines).toHaveLength(N * M)

            const expected = new Set(
                Array.from({length: N}).flatMap(() =>
                    Array.from({length: M}, (_, i) => `msg ${c}-${i}`),
                ),
            )

            expect(new Set(flushedLines)).toEqual(expected)
        }

        for (const module of modules) {
            const moduleScope = scope(module, module)
            const ref = tc.reference(moduleScope)("log")

            expect(durable[ref]).toHaveLength(M * cycles)

            const expected = new Set(
                Array.from({length: cycles}).flatMap((_, c) =>
                    Array.from({length: M}, (_, i) => `msg ${c}-${i}\n`),
                ),
            )

            expect(new Set(durable[ref])).toEqual(expected)
        }
    })
})