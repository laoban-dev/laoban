import { RequestInfo, RequestInit, Response } from "node-fetch";

export type FetchFn = ( url: RequestInfo, init?: RequestInit ) => Promise<Response>
export function addAuth ( f: FetchFn, authHeader: string ): FetchFn {
  return ( url, init ) => {
    const headers = { authorization: authHeader, ...init.headers || {} }
    const newInit = { ...init, headers }
    return f ( url, newInit )
  }
}

