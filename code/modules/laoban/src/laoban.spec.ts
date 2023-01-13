//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { makeSessionId } from "./laoban";

describe ( "makeSessionId", () => {
  it ( "should make a name for the sessionId (which is the directory that the logs are stored under)", () => {
    expect ( makeSessionId ( new Date ( Date.UTC ( 2022, 12, 1 ) ), 'someName', [ 'ignore', 'ignore', 'ignore', 'arg1$%^&', '-_ARGs' ] ) )
      .toEqual ( '2023-01-01T00_00_00.000Z_someName_arg1_-_ARGs' )
  } )
} )