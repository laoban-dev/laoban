import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import {
    ChannelsState,
    emptyChannelState,
    ErrorsFn,
    fixedTimeService,
    ModuleObservabilityScope,
    Observability,
    recordingObservability,
    Write,
} from "@laoban/observability"
import {nodeChannelTc, NodeReadChannel, NodeRef, NodeWriteChannel} from "./observability.node"
import {RecordingWritable} from "./recording.writable"

export type TestNodeObservabilityPurpose = ".log" | ".session"

export type TestNodeObservabilityContext = {
    recording: ReturnType<typeof recordingObservability>
    observability: Observability
    channelsState: ChannelsState<
        TestNodeObservabilityPurpose,
        NodeReadChannel,
        NodeWriteChannel,
        NodeRef
    >
    stdOut: Write
    stdOutRecorder: RecordingWritable
    root: string
}

export type MakeTestNodeObservabilityContextOptions = Readonly<{
    correlationId?: string
    rootPrefix?: string
    onError?: ErrorsFn
}>

export type NodeObservabilityFixture = Readonly<{
    makeContext: (
        options?: MakeTestNodeObservabilityContextOptions,
    ) => Promise<TestNodeObservabilityContext>

    cleanup: () => Promise<void>

    readText: (
        context: TestNodeObservabilityContext,
        ...parts: string[]
    ) => Promise<string>

    readLog: (
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ) => Promise<string>

    readSession: (
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ) => Promise<string>

    logPath: (
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ) => string

    sessionPath: (
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ) => string

    expectedRootLog: (msg: string) => {
        moduleScope: {
            module: undefined
            directory: "."
        }
        msg: string
    }

    moduleScope: (
        module: string | null | undefined,
        directory: string,
    ) => ModuleObservabilityScope
}>

const defaultOnError: ErrorsFn = e => {
    throw new Error(JSON.stringify(e))
}

function normaliseSlashes(text: string): string {
    return text.replace(/\\/g, "/")
}

function safeRelativeDirectory(directory: string): string {
    return normaliseSlashes(directory)
        .replace(/^\/+/, "")
        .replace(/:/g, "")
}

export function testNodeReference(root: string) {
    return (moduleScope: ModuleObservabilityScope) =>
        (purpose: TestNodeObservabilityPurpose): NodeRef =>
            path.join(root, safeRelativeDirectory(moduleScope.directory), purpose)
}

async function makeTempRoot(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

export function nodeObservabilityFixture(): NodeObservabilityFixture {
    const roots: string[] = []

    async function makeContext(
        options: MakeTestNodeObservabilityContextOptions = {},
    ): Promise<TestNodeObservabilityContext> {
        const {
            correlationId = "test-correlation-id",
            rootPrefix = "laoban-node-observability-",
            onError = defaultOnError,
        } = options

        const root = await makeTempRoot(rootPrefix)
        roots.push(root)

        const recording = recordingObservability(
            {},
            correlationId,
            fixedTimeService(0),
        )

        const stdOutRecorder = new RecordingWritable()

        const stdOut: Write = msg => {
            stdOutRecorder.write(msg)
        }

        const tc = nodeChannelTc<TestNodeObservabilityPurpose>({
            reference: testNodeReference(root),
            keyFrom: moduleScope => String(moduleScope.module ?? ""),
        })

        const purposes: TestNodeObservabilityPurpose[] = [".log", ".session"]

        const channelsState = emptyChannelState(
            tc,
            purposes,
            onError,
        )

        return {
            recording,
            observability: recording.observability,
            channelsState,
            stdOut,
            stdOutRecorder,
            root,
        }
    }

    async function cleanup(): Promise<void> {
        await Promise.all(
            roots.splice(0).map(root =>
                fs.rm(root, {recursive: true, force: true}),
            ),
        )
    }

    async function readText(
        context: TestNodeObservabilityContext,
        ...parts: string[]
    ): Promise<string> {
        return fs.readFile(path.join(context.root, ...parts), "utf8")
    }

    function logPath(
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ): string {
        return path.join(
            context.root,
            safeRelativeDirectory(moduleDirectory),
            ".log",
        )
    }

    function sessionPath(
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ): string {
        return path.join(
            context.root,
            safeRelativeDirectory(moduleDirectory),
            ".session",
        )
    }

    async function readLog(
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ): Promise<string> {
        return fs.readFile(logPath(context, moduleDirectory), "utf8")
    }

    async function readSession(
        context: TestNodeObservabilityContext,
        moduleDirectory: string,
    ): Promise<string> {
        return fs.readFile(sessionPath(context, moduleDirectory), "utf8")
    }

    function expectedRootLog(msg: string) {
        return {
            moduleScope: {
                module: undefined,
                directory: "." as const,
            },
            msg: `00:00:00 INFO ${msg}\n`,
        }
    }

    function moduleScope(
        module: string | null | undefined,
        directory: string,
    ): ModuleObservabilityScope {
        return {
            module,
            directory,
        }
    }

    return {
        makeContext,
        cleanup,
        readText,
        readLog,
        readSession,
        logPath,
        sessionPath,
        expectedRootLog,
        moduleScope,
    }
}