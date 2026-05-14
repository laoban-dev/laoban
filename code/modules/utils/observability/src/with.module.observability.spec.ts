import {errors, errorsOrThrow, value, valueOrThrow} from "@laoban/errors"
import {
    ModuleObservabilityScope,
    Observability,
} from "./observability"
import {
    ChannelTc,
    ChannelsState,
    emptyChannelState,
} from "./write.with.flush"
import {withModuleObservability} from "./with.module.observability"

type TestPurpose = "log"

type TestChannel = {
    ref: string
    children?: TestChannel[]
    composed?: boolean
    closed?: boolean
}

function makeObservability(): Observability {
    return {
        correlationId: "test-correlation",
        moduleScope: {
            module: undefined,
            directory: ".",
        },
        debugConfig: {},
        timeService: {
            now: () => 0,
        },
        observabilityTemplates: {},
        dictionary: {},

        log: jest.fn(),
        debug: jest.fn(),
        countMetric: jest.fn(),
        durationMetric: jest.fn(),
    } as unknown as Observability
}

function makeChannelTc(events: string[]): ChannelTc<TestPurpose, never, TestChannel, string> {
    return {
        reference: moduleScope =>
            purpose => `${moduleScope.directory}/${purpose}.log`,

        keyFrom: moduleScope =>
            String(moduleScope.module ?? ""),

        create: async ref => {
            events.push(`create ${ref}`)
            return value({ref})
        },

        composeWritables: channels => {
            const ref = `composed(${channels.map(c => c.ref).join(",")})`
            events.push(`compose ${ref}`)
            return {
                ref,
                children: channels,
                composed: true,
            }
        },

        write: async (channel, text) => {
            events.push(`write ${channel.ref}: ${text}`)
            return value(undefined)
        },

        closeReadable: async () =>
            value(undefined),

        closeWritable: async channel => {
            events.push(`close ${channel.ref}`)
            channel.closed = true
            return value(undefined)
        },

        sendFromRefToWrite: async () =>
            value(0),
    }
}

function makeContext(events: string[]) {
    const tc = makeChannelTc(events)

    const purposes: TestPurpose[] = ["log"]

    const channelsState = emptyChannelState<TestPurpose, never, TestChannel, string>(
        tc,
        purposes,
        error => events.push(`error ${error.errors.map(e => e.message).join(", ")}`),
    )

    return {
        observability: makeObservability(),
        channelsState,
    }
}

function addOpenChannel(
    channelsState: ChannelsState<TestPurpose, never, TestChannel, string>,
    moduleScope: ModuleObservabilityScope,
): void {
    const key = channelsState.tc.keyFrom(moduleScope)
    const ref = channelsState.tc.reference(moduleScope)("log")

    channelsState.state[key] = {
        refs: [ref],
        lastSize: 0,
        moduleScope,
        touched: true,
        channels: [{ref}],
    }
}

describe("withModuleObservability", () => {
    const moduleScope: ModuleObservabilityScope = {
        module: "alpha" as any,
        directory: "/workspace/alpha",
    }

    it("creates module observability, passes it to the callback, closes child channels, and returns the callback value", async () => {
        const events: string[] = []
        const context = makeContext(events)

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                events.push("run")
                expect(observability.moduleScope).toEqual(moduleScope)
                expect(observability.writable.ref).toEqual(
                    "composed(/workspace/alpha/log.log)",
                )
                return value("done")
            },
        )

        expect(valueOrThrow(actual)).toEqual("done")
        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "run",
            "close /workspace/alpha/log.log",
        ])

        expect(context.channelsState.state.alpha.channels).toBeUndefined()
    })

    it("closes module observability when the callback returns errors", async () => {
        const events: string[] = []
        const context = makeContext(events)

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async () => {
                events.push("run")
                return errors({
                    kind: "callback",
                    message: "callback failed",
                })
            },
        )

        expect(errorsOrThrow(actual)).toEqual([
            {
                kind: "callback",
                message: "callback failed",
            },
        ])

        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "run",
            "close /workspace/alpha/log.log",
        ])

        expect(context.channelsState.state.alpha.channels).toBeUndefined()
    })

    it("does not catch thrown callback exceptions and therefore does not run ErrorsOr cleanup", async () => {
        const events: string[] = []
        const context = makeContext(events)

        await expect(
            withModuleObservability(
                context,
                moduleScope,
                async () => {
                    events.push("run")
                    throw new Error("boom")
                },
            ),
        ).rejects.toThrow("boom")

        // withCleanupErrorsOr is ErrorsOr cleanup, not exception-finally.
        // Thrown exceptions are bugs/unsafe boundaries and are not caught here.
        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "run",
        ])

        expect(context.channelsState.state.alpha.channels).toEqual([
            {ref: "/workspace/alpha/log.log"},
        ])
    })

    it("creates the module channel even if the callback does not log", async () => {
        const events: string[] = []
        const context = makeContext(events)

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                expect(observability.moduleScope).toEqual(moduleScope)
                return value(123)
            },
        )

        expect(valueOrThrow(actual)).toEqual(123)
        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "close /workspace/alpha/log.log",
        ])
        expect(context.channelsState.state.alpha.channels).toBeUndefined()
    })

    it("uses the supplied module scope rather than the root scope", async () => {
        const events: string[] = []
        const context = makeContext(events)

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                expect(observability.moduleScope).toEqual({
                    module: "alpha",
                    directory: "/workspace/alpha",
                })
                return value(undefined)
            },
        )

        expect(valueOrThrow(actual)).toBeUndefined()
        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "close /workspace/alpha/log.log",
        ])
    })

    it("writes through the composed module channel and closes the real child channel at the lifecycle boundary", async () => {
        const events: string[] = []
        const context = makeContext(events)

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                events.push("run")
                observability.log("hello")
                return value("done")
            },
        )

        expect(valueOrThrow(actual)).toEqual("done")
        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "run",
            "write composed(/workspace/alpha/log.log): 00:00:00 INFO hello\n",
            "close /workspace/alpha/log.log",
        ])

        expect(context.channelsState.state.alpha.channels).toBeUndefined()
        expect(context.channelsState.state.alpha.touched).toBe(true)
    })

    it("waits for scheduled async writes before closing real child channels", async () => {
        const events: string[] = []
        let releaseWrite!: () => void
        let writeStarted!: () => void

        const writeStartedPromise = new Promise<void>(resolve => {
            writeStarted = resolve
        })

        const tc: ChannelTc<TestPurpose, never, TestChannel, string> = {
            ...makeChannelTc(events),

            write: async (channel, text) => {
                events.push(`write-start ${channel.ref}: ${text}`)
                writeStarted()

                await new Promise<void>(resolve => {
                    releaseWrite = resolve
                })

                events.push(`write-end ${channel.ref}: ${text}`)
                return value(undefined)
            },
        }

        const channelsState = emptyChannelState<TestPurpose, never, TestChannel, string>(
            tc,
            ["log"],
            error => events.push(`error ${error.errors.map(e => e.message).join(", ")}`),
        )

        const context = {
            observability: makeObservability(),
            channelsState,
        }

        const promise = withModuleObservability(
            context,
            moduleScope,
            async observability => {
                events.push("run")
                observability.log("hello")
                return value("done")
            },
        )

        await writeStartedPromise

        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "run",
            "write-start composed(/workspace/alpha/log.log): 00:00:00 INFO hello\n",
        ])

        releaseWrite()

        const actual = await promise

        expect(valueOrThrow(actual)).toEqual("done")
        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "run",
            "write-start composed(/workspace/alpha/log.log): 00:00:00 INFO hello\n",
            "write-end composed(/workspace/alpha/log.log): 00:00:00 INFO hello\n",
            "close /workspace/alpha/log.log",
        ])

        expect(channelsState.state.alpha.channels).toBeUndefined()
        expect(channelsState.state.alpha.touched).toBe(true)
    })

    it("returns close errors after the callback succeeds", async () => {
        const events: string[] = []

        const tc: ChannelTc<TestPurpose, never, TestChannel, string> = {
            ...makeChannelTc(events),
            closeWritable: async channel => {
                events.push(`close ${channel.ref}`)
                return errors({
                    kind: "close",
                    message: "close failed",
                })
            },
        }

        const channelsState = emptyChannelState<TestPurpose, never, TestChannel, string>(
            tc,
            ["log"],
            error => events.push(`error ${error.errors.map(e => e.message).join(", ")}`),
        )

        const context = {
            observability: makeObservability(),
            channelsState,
        }

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async () => value("done"),
        )

        expect(errorsOrThrow(actual)).toEqual([
            {
                kind: "close",
                message: "close failed",
            },
        ])

        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "close /workspace/alpha/log.log",
        ])

        expect(channelsState.state.alpha.channels).toBeUndefined()
    })

    it("accumulates callback errors and close errors", async () => {
        const events: string[] = []

        const tc: ChannelTc<TestPurpose, never, TestChannel, string> = {
            ...makeChannelTc(events),
            closeWritable: async channel => {
                events.push(`close ${channel.ref}`)
                return errors({
                    kind: "close",
                    message: "close failed",
                })
            },
        }

        const channelsState = emptyChannelState<TestPurpose, never, TestChannel, string>(
            tc,
            ["log"],
            error => events.push(`error ${error.errors.map(e => e.message).join(", ")}`),
        )

        const context = {
            observability: makeObservability(),
            channelsState,
        }

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async () => errors({
                kind: "callback",
                message: "callback failed",
            }),
        )

        expect(errorsOrThrow(actual)).toEqual([
            {
                kind: "callback",
                message: "callback failed",
            },
            {
                kind: "close",
                message: "close failed",
            },
        ])

        expect(events).toEqual([
            "create /workspace/alpha/log.log",
            "compose composed(/workspace/alpha/log.log)",
            "close /workspace/alpha/log.log",
        ])

        expect(channelsState.state.alpha.channels).toBeUndefined()
    })

    it("returns channel creation errors and does not run the callback", async () => {
        const events: string[] = []

        const tc: ChannelTc<TestPurpose, never, TestChannel, string> = {
            ...makeChannelTc(events),
            create: async ref => {
                events.push(`create ${ref}`)
                return errors({
                    kind: "create",
                    message: "create failed",
                })
            },
        }

        const channelsState = emptyChannelState<TestPurpose, never, TestChannel, string>(
            tc,
            ["log"],
            error => events.push(`error ${error.errors.map(e => e.message).join(", ")}`),
        )

        const context = {
            observability: makeObservability(),
            channelsState,
        }

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async () => {
                events.push("run")
                return value("done")
            },
        )

        expect(errorsOrThrow(actual)).toEqual([
            {
                kind: "create",
                message: "create failed",
            },
        ])

        expect(events).toEqual([
            "create /workspace/alpha/log.log",
        ])
        expect(channelsState.state.alpha.channels).toBeUndefined()
    })

    it("reuses existing open channels if the state already has them", async () => {
        const events: string[] = []
        const context = makeContext(events)
        addOpenChannel(context.channelsState, moduleScope)

        const actual = await withModuleObservability(
            context,
            moduleScope,
            async observability => {
                events.push("run")
                observability.log("hello")
                return value("done")
            },
        )

        expect(valueOrThrow(actual)).toEqual("done")
        expect(events).toEqual([
            "compose composed(/workspace/alpha/log.log)",
            "run",
            "write composed(/workspace/alpha/log.log): 00:00:00 INFO hello\n",
            "close /workspace/alpha/log.log",
        ])

        expect(context.channelsState.state.alpha.channels).toBeUndefined()
    })
})