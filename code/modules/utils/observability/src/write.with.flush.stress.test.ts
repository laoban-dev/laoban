import {value} from "@laoban/errors"
import {
    ChannelTc,
    emptyChannelState,
    flush,
    syncWriteTo,
    Write,
} from "./write.with.flush"
import {ModuleName, ModuleObservabilityScope} from "./observability"

const delay = (ms: number) => new Promise<void>(res => setTimeout(res, ms))

type Purpose = "log"
type Ref = string

type FakeChannel = {
    ref: Ref
    writes: string[]
    closed?: boolean
}

const scope = (
    module: ModuleName,
    directory: string = String(module ?? "root"),
): ModuleObservabilityScope => ({
    module,
    directory,
})

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

        write: async (channel, text) => {
            await delay(Math.floor(Math.random() * 5))
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

        sendFromRefToWrite: async (ref, from, write: Write) => {
            const allText = (durable[ref] ?? []).join("")
            const delta = allText.slice(from)

            if (delta.length > 0) {
                write(delta)
            }

            return value(allText.length)
        },
    }

    return {tc, durable}
}

describe("stress: async logging does not lose messages", () => {
    it("writes M messages across N modules over multiple flush cycles", async () => {
        const N = 50
        const M = 20
        const cycles = 100

        const {tc, durable} = makeFakeTc()

        const state = emptyChannelState(tc, ["log"], e => {
            throw new Error(JSON.stringify(e))
        })

        const writer = syncWriteTo(state)
        const modules = Array.from({length: N}, (_, i) => `module-${i}`)
        const moduleScopes = modules.map(module => scope(module, module))

        for (let c = 0; c < cycles; c++) {
            await Promise.all(
                moduleScopes.flatMap(moduleScope =>
                    Array.from({length: M}, async (_, i) => {
                        await delay(Math.floor(Math.random() * 5))
                        writer(moduleScope)(`msg ${c}-${i}\n`)
                    })
                )
            )

            const flushed: string[] = []

            const results = await Promise.all(
                moduleScopes.map(moduleScope =>
                    flush(state)(moduleScope)(text => {
                        flushed.push(text)
                    })
                )
            )

            expect(results).toEqual(modules.map(() => value(undefined)))
        }

        for (const module of modules) {
            const moduleScope = scope(module, module)
            const ref = tc.reference(moduleScope)("log")

            expect(durable[ref]).toHaveLength(M * cycles)

            const expected = new Set(
                Array.from({length: cycles}).flatMap((_, c) =>
                    Array.from({length: M}, (_, i) => `msg ${c}-${i}\n`)
                )
            )

            expect(new Set(durable[ref])).toEqual(expected)
        }
    })
})