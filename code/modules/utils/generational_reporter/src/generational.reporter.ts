import {
    BaseIssue,
    ErrorsOr,
    errors,
    flatMapBaseIssueK,
    isErrors,
    sequenceArrayErrorsOrK,
    value,
    warnings,
} from "@laoban/errors"
import {
    ChannelObservability,
    ModuleObservabilityScope,
    Observability,
    WithModuleObservabilityContext,
} from "@laoban/observability"

export type WithItemObservability = (
    moduleScope: ModuleObservabilityScope,
    fn: (observability: ChannelObservability) => Promise<ErrorsOr<unknown>>,
) => Promise<ErrorsOr<unknown>>

export interface GenerationalWalkConfig<
    Input,
    G,
    Purpose = unknown,
    ReadChannel = unknown,
    WriteChannel = unknown,
    Ref = unknown,
> extends WithModuleObservabilityContext<Purpose, ReadChannel, WriteChannel, Ref> {
    load: () => Promise<ErrorsOr<Input>>
    toGenerations: (input: Input) => ErrorsOr<G[][]>
    toModuleScope: (input: Input, item: G) => ModuleObservabilityScope

    withItemObservability: WithItemObservability
    flush: () => Promise<ErrorsOr<unknown>>

    continueOnGenerationError?: boolean
}

export interface GenerationWalkSummary {
    generationCount: number
    plannedItemCount: number
    visitedItemCount: number
    errorCount: number
    warningCount: number
    stoppedEarly: boolean
}

export interface GenerationalWalkVisitor<Input, G> {
    visit: (
        input: Input,
        item: G,
        observability: ChannelObservability,
    ) => Promise<ErrorsOr<unknown>>

    displayGenerationErrors?: (
        input: Input,
        generationIndex: number,
        generation: G[],
        generationErrors: BaseIssue[],
        observability: Observability,
    ) => Promise<ErrorsOr<unknown>>

    displaySummary?: (
        input: Input,
        summary: GenerationWalkSummary,
        observability: Observability,
    ) => Promise<ErrorsOr<unknown>>

    displayFinalIssues?: (
        input: Input,
        warnings: BaseIssue[],
        errors: BaseIssue[],
        observability: Observability,
    ) => Promise<ErrorsOr<unknown>>
}

export async function generationalWalk<
    Input,
    G,
    Purpose = unknown,
    ReadChannel = unknown,
    WriteChannel = unknown,
    Ref = unknown,
>(
    config: GenerationalWalkConfig<Input, G, Purpose, ReadChannel, WriteChannel, Ref>,
    visitor: GenerationalWalkVisitor<Input, G>,
): Promise<ErrorsOr<unknown>> {
    return flatMapBaseIssueK(await config.load(), async input => {
        const generationsResult = config.toGenerations(input)

        if (isErrors(generationsResult))
            return generationsResult

        const generations = generationsResult.value
        const allWarnings: BaseIssue[] = [...warnings(generationsResult)]
        const allErrors: BaseIssue[] = []

        let visitedItemCount = 0
        let stoppedEarly = false

        for (let generationIndex = 0; generationIndex < generations.length; generationIndex++) {
            const generation = generations[generationIndex]

            const generationVisitResult = await sequenceArrayErrorsOrK(
                generation.map(item =>
                    config.withItemObservability(
                        config.toModuleScope(input, item),
                        moduleObservability =>
                            visitor.visit(input, item, moduleObservability),
                    ),
                ),
            )

            visitedItemCount += generation.length
            allWarnings.push(...warnings(generationVisitResult))

            const generationErrors: BaseIssue[] = []

            if (isErrors(generationVisitResult)) {
                generationErrors.push(...generationVisitResult.errors)
                allErrors.push(...generationVisitResult.errors)
            }

            const flushResult = await config.flush()

            allWarnings.push(...warnings(flushResult))

            if (isErrors(flushResult)) {
                generationErrors.push(...flushResult.errors)
                allErrors.push(...flushResult.errors)
            }

            if (generationErrors.length > 0 && visitor.displayGenerationErrors) {
                const displayResult = await visitor.displayGenerationErrors(
                    input,
                    generationIndex,
                    generation,
                    generationErrors,
                    config.observability,
                )

                allWarnings.push(...warnings(displayResult))

                if (isErrors(displayResult))
                    allErrors.push(...displayResult.errors)
            }

            if (generationErrors.length > 0 && config.continueOnGenerationError === false) {
                stoppedEarly = true
                break
            }
        }

        const finalFlushResult = await config.flush()

        allWarnings.push(...warnings(finalFlushResult))

        if (isErrors(finalFlushResult))
            allErrors.push(...finalFlushResult.errors)

        const summary: GenerationWalkSummary = {
            generationCount: generations.length,
            plannedItemCount: generations.reduce((total, generation) => total + generation.length, 0),
            visitedItemCount,
            errorCount: allErrors.length,
            warningCount: allWarnings.length,
            stoppedEarly,
        }

        config.observability.countMetric(`generationalWalk.generationCount.${summary.generationCount}`)
        config.observability.countMetric(`generationalWalk.plannedItemCount.${summary.plannedItemCount}`)
        config.observability.countMetric(`generationalWalk.visitedItemCount.${summary.visitedItemCount}`)
        config.observability.countMetric(`generationalWalk.errorCount.${summary.errorCount}`)
        config.observability.countMetric(`generationalWalk.warningCount.${summary.warningCount}`)

        if (summary.stoppedEarly)
            config.observability.countMetric("generationalWalk.stoppedEarly")

        if (visitor.displaySummary) {
            const summaryResult = await visitor.displaySummary(
                input,
                summary,
                config.observability,
            )

            allWarnings.push(...warnings(summaryResult))

            if (isErrors(summaryResult))
                allErrors.push(...summaryResult.errors)
        }

        if ((allWarnings.length > 0 || allErrors.length > 0) && visitor.displayFinalIssues) {
            const finalIssuesResult = await visitor.displayFinalIssues(
                input,
                allWarnings,
                allErrors,
                config.observability,
            )

            allWarnings.push(...warnings(finalIssuesResult))

            if (isErrors(finalIssuesResult))
                allErrors.push(...finalIssuesResult.errors)
        }

        if (allErrors.length === 0)
            return value(undefined, allWarnings)

        const [first, ...rest] = allErrors
        return errors(first, rest, allWarnings)
    })
}