import {mkdtemp, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import * as path from "node:path"
import {isErrors, value, valueOrThrow} from "@laoban/errors"
import {
    defaultModuleObservabilityScope,
    flushAllTouchedChannels,
    ModuleObservabilityScope,
    withModuleObservability,
} from "@laoban/observability"
import {
    createNodeObservability,
    NodeReadChannel,
    NodeRef,
    NodeWriteChannel,
    recordingWritable,
} from "@laoban/observability_node"
import {
    generationalWalk,
    GenerationalWalkConfig,
    GenerationalWalkVisitor,
} from "@laoban/generational_reporter"

type Purpose = ".log" | ".session"

type Item = {
    name: string
    message: string
}

type Input = {
    generations: Item[][]
}

describe("generationalWalk with real node observability", () => {
    let dir: string

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), "laoban-generational-walk-"))
    })

    afterEach(async () => {
        await rm(dir, {recursive: true, force: true})
    })

    const reference = (moduleScope: ModuleObservabilityScope) =>
        (purpose: Purpose): NodeRef =>
            path.join(moduleScope.directory, `${moduleScope.module}${purpose}`)

    function moduleScope(item: Item): ModuleObservabilityScope {
        return defaultModuleObservabilityScope(item.name, dir)
    }

    function messageParts(text: string): string[] {
        return text
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .trimEnd()
            .split("\n")
            .filter(line => line.length > 0)
            .map(line => line.substring(line.lastIndexOf(" ") + 1))
    }

    it("creates real module log files and flushes touched durable content to a writer", async () => {
        const out = recordingWritable()

        const alpha: Item = {
            name: "alpha",
            message: "alpha_says_hello",
        }

        const beta: Item = {
            name: "beta",
            message: "beta_says_hello",
        }

        const input: Input = {
            generations: [[alpha, beta]],
        }

        const context = createNodeObservability<Purpose>({
            correlationId: "test-correlation",
            moduleScope: defaultModuleObservabilityScope(undefined, dir),
            channel: out,
            purposes: [".log", ".session"],
            reference,
            onError: jest.fn(),
        })

        const config: GenerationalWalkConfig<
            Input,
            Item,
            Purpose,
            NodeReadChannel,
            NodeWriteChannel,
            NodeRef
        > = {
            ...context,

            load: async () =>
                value(input),

            toGenerations: input =>
                value(input.generations),

            toModuleScope: (_input, item) =>
                moduleScope(item),


            flush: () =>
                flushAllTouchedChannels(context.channelsState)(out),

            continueOnGenerationError: true,
        }

        const visitor: GenerationalWalkVisitor<Input, Item> = {
            visit: async (_input, item, observability) => {
                observability.log(item.message)
                return value(undefined)
            },
        }

        const result = await generationalWalk(config, visitor, out)

        expect(valueOrThrow(result)).toBeUndefined()

        const alphaLog = await readFile(reference(moduleScope(alpha))(".log"), "utf8")
        const betaLog = await readFile(reference(moduleScope(beta))(".log"), "utf8")

        expect(messageParts(alphaLog)).toEqual(["alpha_says_hello"])
        expect(messageParts(betaLog)).toEqual(["beta_says_hello"])

        expect(messageParts(out.text()).sort()).toEqual([
            "alpha_says_hello",
            "beta_says_hello",
        ])

        const outputAfterWalk = out.text()

        const secondFlush = await config.flush(out)

        expect(secondFlush).toEqual(value(undefined))
        expect(out.text()).toEqual(outputAfterWalk)
    })

    it("exposes a module writable that writes raw output to real durable channels", async () => {
        const out = recordingWritable()

        const alpha: Item = {
            name: "alpha",
            message: "alpha_raw_output",
        }

        const context = createNodeObservability<Purpose>({
            correlationId: "test-correlation",
            moduleScope: defaultModuleObservabilityScope(undefined, dir),
            channel: out,
            purposes: [".log", ".session"],
            reference,
            onError: jest.fn(),
        })

        const result = await withModuleObservability(
            context,
            moduleScope(alpha),
            async observability => {
                const writable =  observability.writable

                if (isErrors(writable))
                    return writable

                await new Promise<void>((resolve, reject) => {
                    writable.write(`raw ${alpha.message}\n`, err =>
                        err ? reject(err) : resolve(),
                    )
                })

                observability.log(alpha.message)

                return value(undefined)
            },
        )

        expect(valueOrThrow(result)).toBeUndefined()

        const alphaLog = await readFile(reference(moduleScope(alpha))(".log"), "utf8")
        const alphaSession = await readFile(reference(moduleScope(alpha))(".session"), "utf8")

        expect(alphaLog).toContain(`raw ${alpha.message}`)
        expect(alphaLog).toContain(alpha.message)

        expect(alphaSession).toContain(`raw ${alpha.message}`)
        expect(alphaSession).toContain(alpha.message)
    })

    it("does not flush raw module writable output because raw writes do not mark channels as touched", async () => {
        const out = recordingWritable()

        const alpha: Item = {
            name: "alpha",
            message: "alpha_raw_output",
        }

        const context = createNodeObservability<Purpose>({
            correlationId: "test-correlation",
            moduleScope: defaultModuleObservabilityScope(undefined, dir),
            channel: out,
            purposes: [".log", ".session"],
            reference,
            onError: jest.fn(),
        })

        const writeResult = await withModuleObservability(
            context,
            moduleScope(alpha),
            async observability => {
                const writable = await observability.writable

                if (isErrors(writable))
                    return writable

                await new Promise<void>((resolve, reject) => {
                    writable.write(`raw ${alpha.message}\n`, err =>
                        err ? reject(err) : resolve(),
                    )
                })

                return value(undefined)
            },
        )

        expect(valueOrThrow(writeResult)).toBeUndefined()

        const flushResult = await flushAllTouchedChannels(context.channelsState)(out)

        expect(valueOrThrow(flushResult)).toBeUndefined()

        expect(out.lines()).toEqual([])

        const outputAfterFlush = out.text()

        const secondFlush = await flushAllTouchedChannels(context.channelsState)(out)

        expect(secondFlush).toEqual(value(undefined))
        expect(out.text()).toEqual(outputAfterFlush)
    })
})