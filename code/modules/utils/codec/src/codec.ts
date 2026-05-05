import type { ErrorsOr } from "@laoban/errors"
import type { Observability } from "@laoban/observability"

export type ICodec<T> = {
    encode(t: T, observability: Observability): ErrorsOr<string>
    decode(s: string, observability: Observability): ErrorsOr<T>
}