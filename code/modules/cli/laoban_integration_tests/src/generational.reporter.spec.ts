import {mkdtemp, readFile, rm} from "node:fs/promises"
import {tmpdir} from "node:os"
import * as path from "node:path"
import {isErrors, value} from "@laoban/errors"
import {
    defaultModuleObservabilityScope,
    flush,
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

    it("creates real module log files and flushes their durable content to a writer", async () => {
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

            withItemObservability: (scope, fn) =>
                withModuleObservability(context, scope, fn),

            flush: async () => {
                const alphaResult = await flush(context.channelsState)(moduleScope(alpha))(msg => {
                    out.write(msg)
                })

                if (isErrors(alphaResult)) return alphaResult

                return flush(context.channelsState)(moduleScope(beta))(msg => {
                    out.write(msg)
                })
            },

            continueOnGenerationError: true,
        }

        const visitor: GenerationalWalkVisitor<Input, Item> = {
            visit: async (_input, item, observability) => {
                observability.log(item.message)
                return value(undefined)
            },
        }

        const result = await generationalWalk(config, visitor)

        expect(isErrors(result)).toBe(false)

        const alphaLog = await readFile(reference(moduleScope(alpha))(".log"), "utf8")
        const betaLog = await readFile(reference(moduleScope(beta))(".log"), "utf8")

        expect(messageParts(alphaLog)).toEqual(["alpha_says_hello"])
        expect(messageParts(betaLog)).toEqual(["beta_says_hello"])

        expect(messageParts(out.text()).sort()).toEqual([
            "alpha_says_hello",
            "beta_says_hello",
        ])

        const outputAfterWalk = out.text()

        const secondFlush = await config.flush()

        expect(secondFlush).toEqual(value(undefined))
        expect(out.text()).toEqual(outputAfterWalk)
    })
})