import {ErrorsOr, isErrors, withCleanupErrorsOr} from "@laoban/errors"
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
    const observabilityResult = await moduleObservability(
        {
            ...context.observability,
            moduleScope,
        },
        moduleScope,
        context.channelsState,
    )

    if (isErrors(observabilityResult))
        return observabilityResult

    const observability = observabilityResult.value

    return withCleanupErrorsOr(
        () => fn(observability),
        () => observability.close(),
    )
}