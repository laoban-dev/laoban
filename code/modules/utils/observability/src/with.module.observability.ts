import {ErrorsOr, flatMapErrorsOrK, withCleanupErrorsOr} from "@laoban/errors"
import {
    ModuleObservability,
    moduleObservability,
} from "./module.observability"
import {
    ModuleObservabilityScope,
    Observability,
} from "./observability"
import {ChannelsState} from "./write.with.flush"

export type WithModuleObservabilityContext<
    Purpose = unknown,
    ReadChannel = unknown,
    WriteChannel = unknown,
    Ref = unknown,
> = Readonly<{
    observability: Observability
    channelsState: ChannelsState<Purpose, ReadChannel, WriteChannel, Ref>
}>

export function makeModuleObservability<
    Purpose,
    ReadChannel,
    WriteChannel,
    Ref,
>(
    context: WithModuleObservabilityContext<
        Purpose,
        ReadChannel,
        WriteChannel,
        Ref
    >,
    moduleScope: ModuleObservabilityScope,
): Promise<ErrorsOr<ModuleObservability<WriteChannel>>> {
    return moduleObservability(
        {
            ...context.observability,
            moduleScope,
        },
        moduleScope,
        context.channelsState,
    )
}

export async function withExistingModuleObservability<
    WriteChannel,
    T,
>(
    observability: ModuleObservability<WriteChannel>,
    fn: (
        observability: ModuleObservability<WriteChannel>,
    ) => Promise<ErrorsOr<T>>,
): Promise<ErrorsOr<T>> {
    return withCleanupErrorsOr(
        () => fn(observability),
        () => observability.close(),
    )
}

export async function withModuleObservability<
    Purpose,
    ReadChannel,
    WriteChannel,
    Ref,
    T,
>(
    context: WithModuleObservabilityContext<
        Purpose,
        ReadChannel,
        WriteChannel,
        Ref
    >,
    moduleScope: ModuleObservabilityScope,
    fn: (
        observability: ModuleObservability<WriteChannel>,
    ) => Promise<ErrorsOr<T>>,
): Promise<ErrorsOr<T>> {
    return flatMapErrorsOrK(
        await makeModuleObservability(context, moduleScope),
        observability =>
            withExistingModuleObservability(
                observability,
                fn,
            ),
    )
}