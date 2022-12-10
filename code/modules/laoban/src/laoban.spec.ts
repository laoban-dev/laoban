import { makeSessionId } from "./laoban";

describe ( "makeSessionId", () => {
  it ( "should make a name for the sessionId (which is the directory that the logs are stored under)", () => {
    expect ( makeSessionId ( new Date ( Date.UTC ( 2022, 12, 1 ) ), 'someName', [ 'ignore', 'ignore', 'ignore', 'arg1$%^&', '-_ARGs' ] ) )
      .toEqual ( '2023-01-01T00.00.00.000Z.someName.arg1,-_ARGs' )
  } )
} )