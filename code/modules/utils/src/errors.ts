import { flatten } from "./utils";

export type ErrorsAnd<T> = T | string[]

export function mapArrayOfErrorsAnd<T, T1> ( ts: ErrorsAnd<T>[], fn: ( ts: T[] ) => T1 ): ErrorsAnd<T1> {
  const allErrors = ts.filter ( hasErrors )
  if ( allErrors.length > 0 ) return flatten ( allErrors )
  const allResults: T[] = ts.map ( value )
  return fn ( allResults )
}

export function reportErrors ( e: string[] ): string[] {
  e.forEach ( e => console.error ( e ) )
  return e
}
export function hasErrors<T> ( t: ErrorsAnd<T> ): t is string[] {
  return Array.isArray ( t )
}
export function errors<T> ( t: ErrorsAnd<T> ): string[] {
  return hasErrors ( t ) ? t : []
}

export function value<T> ( t: ErrorsAnd<T> ): T | undefined {
  return hasErrors ( t ) ? undefined : t
}

export function mapErrors<T, T1> ( t: ErrorsAnd<T>, fn: ( t: T ) => ErrorsAnd<T1> ): ErrorsAnd<T1> {
  return hasErrors ( t ) ? t : fn ( t )
}
export function mapErrorsK<T, T1> ( t: ErrorsAnd<T>, fn: ( t: T ) => Promise<ErrorsAnd<T1>> ): Promise<ErrorsAnd<T1>> {
  return hasErrors ( t ) ? Promise.resolve ( t ) : fn ( t )
}
export function flattenErrors<T> ( t: ErrorsAnd<ErrorsAnd<T>> ): ErrorsAnd<T> {
  return hasErrors ( t ) ? flatten ( t as any ) : t
}

export function flatMapErrors<T, T1> ( t: ErrorsAnd<T>, fn: ( t: T ) => ErrorsAnd<T1> ): ErrorsAnd<T1> {
  return flattenErrors ( mapErrors ( t, fn ) )
}

export function flatMapErrorsK<T, T1> ( t: ErrorsAnd<T>, fn: ( t: T ) => Promise<ErrorsAnd<T1>> ): Promise<ErrorsAnd<T1>> {
  return hasErrors ( t ) ? Promise.resolve ( t ) : fn ( t ).then ( flattenErrors )
}

export function foldErrors<Acc, T> ( ts: T[], zero: Acc, fn: ( acc: ErrorsAnd<Acc>, t: T ) => ErrorsAnd<Acc> ): ErrorsAnd<Acc> {
  return ts.reduce ( ( acc, t ) => mapErrors ( acc, acc => fn ( acc, t ) ), zero )
}

export function foldErrorsK<Acc, T> ( ts: T[], zero: Acc, fn: ( acc: ErrorsAnd<Acc>, t: T ) => Promise<ErrorsAnd<Acc>> ): Promise<ErrorsAnd<Acc>> {
  return ts.reduce ( ( accP, t ) => accP.then ( acc => mapErrorsK ( acc, acc => fn ( acc, t ) ) ), Promise.resolve ( zero ) )
}