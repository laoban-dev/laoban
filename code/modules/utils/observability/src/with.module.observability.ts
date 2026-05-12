import {ErrorsOr, withCleanupErrorsOr} from "@laoban/errors"
import {ChannelObservability, channelObservabilityWithModule} from "./channel.observability"
import {ModuleObservabilityScope, Observability} from "./observability"
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

export function withModuleObservability<
    TContext extends WithModuleObservabilityContext<any, any, any, any>,
    T,
>(
    context: TContext,
    moduleScope: ModuleObservabilityScope,
    fn: (observability: ChannelObservability) => Promise<ErrorsOr<T>>,
): Promise<ErrorsOr<T>> {
    const observability = channelObservabilityWithModule(
        {
            ...context.observability,
            moduleScope,
        },
        moduleScope,
        context.channelsState,
    )

    return withCleanupErrorsOr(
        () => fn(observability),
        () => observability.close(),
    )
}