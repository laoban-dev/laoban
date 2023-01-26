import { firstSegment } from "./strings";

export function findPart ( dic: any, ref: string ): any {
  if ( ref === undefined ) return undefined
  const parts = ref.split ( '.' )
  try {
    return parts.reduce ( ( acc, part ) => acc[ firstSegment ( part, ':' ) ], dic )
  } catch ( e ) {return undefined}
}