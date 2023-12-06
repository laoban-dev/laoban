//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { cannonicalLoop, findAllLoopsFor, removeIfSamePath, removeIfSuperLoop, throwExceptionIfLoopsFor, uniqueLoops } from "./cyclicGraphDetection";
import { topologicalSort, topologicalSortNames, TopologicalSortTypeClasses } from "./topologicalSort";
import { NullDebugCommands } from "@laoban/debug";

interface Thing {
  name: string,
  children: string[]
}
// let thing0a = {name: "zero", children: []}
const thing0a: Thing = { name: "zeroa", children: [] }
const thing0b: Thing = { name: "zerob", children: [] }
const thing0WithLoop: Thing = { name: "loopa", children: [ 'loopa' ] }


const thing1a: Thing = { name: "onea", children: [ thing0a.name ] }
const thing1b: Thing = { name: "oneb", children: [ thing0a.name ] }
const thing1c: Thing = { name: "onec", children: [ thing0b.name ] }

const thing2a: Thing = { name: "twoa", children: [ thing0a.name, thing1a.name ] }
const thing2b: Thing = { name: "twob", children: [ thing1b.name ] }
const thing2c: Thing = { name: "twoc", children: [ thing0b.name, thing1a.name ] }

describe ( "findAllLoopsFor", () => {
  it ( "should return nothing for empty", () => {
    expect ( findAllLoopsFor ( {} ) ).toEqual ( {} )
  } )
  it ( "Should return nothing if there are no loops", () => {
    expect ( findAllLoopsFor ( {
      "two": [ "one" ],
      "one": [ "zeroa", "zerob" ],
      "zeroa": []
    } ) ).toEqual ( {} )
  } )
  it ( "Should return a list of loop descriptions when there are single loops ", () => {
    expect ( findAllLoopsFor ( {
      "two": [ "one", "loop" ],
      "one": [ "zeroa", "zerob" ],
      "zeroa": [],
      "loop": [ "two" ]
    } ) ).toEqual ( {
      "loop": [ [ "loop", "two", "loop" ] ],
      "two": [ [ "two", "loop", "two" ] ],
    } )
  } )
  it ( "Should return a list of loop descriptions when there are multiple loops ", () => {
    expect ( findAllLoopsFor ( {
      "two": [ "one", "loop1", "loop2" ],
      "one": [ "zeroa", "zerob" ],
      "zeroa": [],
      "zerob": [],
      "loop1": [ "two" ],
      "loop2": [ "loop2Mid" ],
      "loop2Mid": [ "two" ],
    } ) ).toEqual ( {
      "loop1": [
        [ "loop1", "two", "loop1" ],
        [ "loop1", "two", "loop2", "loop2Mid", "two" ]
      ],
      "loop2": [
        [ "loop2", "loop2Mid", "two", "loop1", "two" ],
        [ "loop2", "loop2Mid", "two", "loop2" ] ],
      "loop2Mid": [
        [ "loop2Mid", "two", "loop1", "two" ],
        [ "loop2Mid", "two", "loop2", "loop2Mid" ]
      ],
      "two": [
        [ "two", "loop1", "two" ],
        [ "two", "loop2", "loop2Mid", "two" ]
      ],
    } )
  } )
} )

describe ( "cannonicalLoop", () => {
  it ( "should find a cannonical view of a loop", () => {
    expect ( cannonicalLoop ( [] ) ).toEqual ( [] )
    expect ( cannonicalLoop ( [ 'z', 'a', 'd', 'b', 'z' ] ) ).toEqual ( [ "a", "d", "b", "z", 'a' ] )
    expect ( cannonicalLoop ( [ 'a', 'd', 'b', 'z', 'a' ] ) ).toEqual ( [ "a", "d", "b", "z", 'a' ] )
    expect ( cannonicalLoop ( [ 'd', 'b', 'z', 'a', 'd' ] ) ).toEqual ( [ "a", "d", "b", "z", 'a' ] )
    expect ( cannonicalLoop ( [ "loop1", "two", "loop1" ], ) ).toEqual ( [ "loop1", "two", "loop1" ] )
    expect ( cannonicalLoop ( [ "two", "loop1", "two" ], ) ).toEqual ( [ "loop1", "two", "loop1" ] )
  } )
  it ( 'should cannonical the loops used in tests', () => {
    expect ( [ [ 'loop1', 'two', 'loop1' ],
      [ 'loop2', 'loop2Mid', 'two', 'loop1', 'two' ],
      [ 'loop2Mid', 'two', 'loop1', 'two' ],
      [ 'two', 'loop1', 'two' ] ].map ( cannonicalLoop ) ).toEqual ( [
      [ "loop1", "two", "loop1" ],
      [ "loop1", "loop2", "loop2Mid", "two", "loop1" ],
      [ "loop1", "loop2Mid", "two", "loop1" ],
      [ "loop1", "two", "loop1" ]
    ] )

  } )
} )

describe ( "remove if same path", () => {
  expect ( removeIfSamePath ( [
    [ "loop1", "two", "loop1" ],
    [ "loop2", "loop2Mid", "two", "loop2" ],
    [ "loop1", "loop2Mid", "two", "loop1" ],
    [ "loop1", "two", "loop2", "loop2Mid", "loop1" ],
    [ "loop1", "loop2", "loop2Mid", "two", "loop1" ]
  ] ) ).toEqual ( [
    [ "loop1", "two", "loop1" ],
    [ "loop2", "loop2Mid", "two", "loop2"
    ]
  ] )
} )

describe ( "removeIfSuperLoop", () => {
  it ( "should return the loops without super loops", () => {
    expect ( removeIfSuperLoop ( [] ) ).toEqual ( [] )
    expect ( removeIfSuperLoop ( [ [ "loop", "two", "loop" ], [ "two", "loop", "two" ] ] ) ).toEqual ( [
      [ "loop", "two", "loop" ], [ "two", "loop", "two" ]
    ] )
    expect ( removeIfSuperLoop ( [
      [ "loop1", "two", "loop1" ],
      [ "loop1", "two", "loop2", "loop2Mid", "two" ],
      [ "loop2", "loop2Mid", "two", "loop1", "two" ],
      [ "loop2", "loop2Mid", "two", "loop2" ],
      [ "loop2Mid", "two", "loop1", "two" ],
      [ "loop2Mid", "two", "loop2", "loop2Mid" ],
      [ "two", "loop1", "two" ],
      [ "two", "loop2", "loop2Mid", "two" ]
    ] ) ).toEqual ( [
      [ "loop1", "two", "loop1" ],
      [ "loop2", "loop2Mid", "two", "loop2" ],
      [ "loop2Mid", "two", "loop2", "loop2Mid" ],
      [ "two", "loop1", "two" ],
      [ "two", "loop2", "loop2Mid", "two" ]
    ] )
  } )
} )

describe ( "uniqueLoops", () => {
  it ( "should return the unique loops", () => {
    expect ( uniqueLoops ( {} ) ).toEqual ( [] )
    expect ( uniqueLoops ( {
      "loop": [ [ "loop", "two", "loop" ] ],
      "two": [ [ "two", "loop", "two" ] ],
    } ) ).toEqual ( [
      [ "loop", "two", "loop" ]
    ] )
    expect ( uniqueLoops ( {
      "loop1": [
        [ "loop1", "two", "loop1" ],
        [ "loop1", "two", "loop2", "loop2Mid", "two" ]
      ],
      "loop2": [
        [ "loop2", "loop2Mid", "two", "loop1", "two" ],
        [ "loop2", "loop2Mid", "two", "loop2" ] ],
      "loop2Mid": [
        [ "loop2Mid", "two", "loop1", "two" ],
        [ "loop2Mid", "two", "loop2", "loop2Mid" ]
      ],
      "two": [
        [ "two", "loop1", "two" ],
        [ "two", "loop2", "loop2Mid", "two" ]
      ],
    } ) ).toEqual ( [
      [ "loop1", "two", "loop1" ],
      [ "loop2", "loop2Mid", "two", "loop2" ]
    ] )
  } )
} )

describe ( "throwExceptionIfLoopsFor", () => {
  it ( "should not throw an exception if there isn't a loop", () => {
    throwExceptionIfLoopsFor ( 'Loop error' ) ( {
      "two": [ "one" ],
      "one": [ "zeroa", "zerob" ],
      "zeroa": []
    } )
  } )
  it ( "should throw an exception if there is a loop", () => {
    expect ( () => throwExceptionIfLoopsFor ( 'Loop error' ) ( {
      "two": [ "one", "loop1", "loop2" ],
      "one": [ "zeroa", "zerob" ],
      "zeroa": [],
      "zerob": [],
      "loop1": [ "two" ],
      "loop2": [ "loop2Mid" ],
      "loop2Mid": [ "two" ],
    } ) ).toThrow ( `Loop error
  loop1 -> two -> loop1
  loop2 -> loop2Mid -> two -> loop2` )

  } )

} )

describe ( "topological sort names", () => {
  it ( "should return [] for {}", () => {
    expect ( topologicalSortNames ( {} ) ).toEqual ( [] )
  } )
  it ( "should return [[name]] for {name:[]}", () => {
    expect ( topologicalSortNames ( { name: [] } ) ).toEqual ( [ [ 'name' ] ] )
  } )
  it ( "should sort a simple graph a->b", () => {
    expect ( topologicalSortNames ( { a: [ 'b' ], b: [] } ) ).toEqual ( [ [ 'a' ], [ 'b' ] ] )
    expect ( topologicalSortNames ( { a: [ 'b' ], b: undefined } ) ).toEqual ( [ [ 'a' ], [ 'b' ] ] )
    expect ( topologicalSortNames ( { b: [], a: [ 'b' ] } ) ).toEqual ( [ [ 'a' ], [ 'b' ] ] )
  } )
  it ( "should sort a simple graph a->b ->c but c isn't in graph", () => {
    expect ( topologicalSortNames ( { a: [ 'b' ], b: [ 'c' ] } ) ).toEqual ( [ [ 'a' ], [ 'b' ], [ 'c' ] ] )
    expect ( topologicalSortNames ( { b: [ 'c' ], a: [ 'b' ] } ) ).toEqual ( [ [ 'a' ], [ 'b' ], [ 'c' ] ] )
  } )
  it ( "should sort a simple graph a->b ->c, a->b2, b2 -> c2 ", () => {
    let expected = [ [ 'a' ], [ 'b', 'b2' ], [ 'c', 'c2' ] ];
    expect ( topologicalSortNames ( { a: [ 'b', 'b2' ], b: [ 'c' ], b2: [ 'c2' ] } ) ).toEqual ( expected )
    expect ( topologicalSortNames ( { b: [ 'c' ], a: [ 'b', 'b2' ], b2: [ 'c2' ] } ) ).toEqual ( expected )
    expect ( topologicalSortNames ( { b: [ 'c' ], b2: [ 'c2' ], a: [ 'b', 'b2' ] } ) ).toEqual ( expected )
  } )
} )

let tc: TopologicalSortTypeClasses<Thing> = {
  debug: () => NullDebugCommands,
  name: t => t.name,
  children: t => t.children,
  loopMessage: ( gs, loops ) => {throw Error ( `had error in ${JSON.stringify ( gs )}\nLoops: ${JSON.stringify ( loops )}` )}
}
describe ( "topologicalSort", () => {
  it ( "should handle an empty graph", () => {
    expect ( topologicalSort ( tc ) ( [] ) ).toEqual ( [] )
  } )
  it ( "should handle a singleton graph", () => {
    expect ( topologicalSort ( tc ) ( [ thing0a ] ) ).toEqual ( [ [ thing0a ] ] )
  } )
  it ( "should handle a graph with children, even if the children aren't in the graph", () => {
    expect ( topologicalSort ( tc ) ( [ thing1a ] ) ).toEqual ( [ [ thing1a ] ] )
  } )
  it ( "should handle a graph with children", () => {
    expect ( topologicalSort ( tc ) ( [ thing0a, thing1a ] ) ).toEqual ( [ [ thing0a ], [ thing1a ] ] )
    expect ( topologicalSort ( tc ) ( [ thing0a, thing1a, thing1b ] ) ).toEqual ( [ [ thing0a ], [ thing1a, thing1b ] ] )
    expect ( topologicalSort ( tc ) ( [ thing0a, thing1a, thing1b, thing2a, thing2a, thing2c ] ).map ( gs => gs.map ( g => g.name ) ) )
      .toEqual ( [
        [ "zeroa" ],
        [ "onea" ],
        [ "oneb", "twoa", "twoc" ]
      ] )
  } )
  it ( "should throw a nice exception if there is a loop", () => {
    expect ( () => topologicalSort ( tc ) ( [ thing0WithLoop ] ) ).toThrow ( `had error in ` )
  } )
} )

describe ( "loop generations bug", () => {
    it ( "should give the correct result", () => {
      const audit: Thing = { name: "audit", children: [ "optics" ] };
      const api: Thing = { name: "api", children: [ "eventProcessor", "eventStore", "idValueStore" ] };
      const eventFixture: Thing = { name: "eventFixture", children: [ "events", "audit" ] };
      const eventProcessor: Thing = { name: "eventProcessor", children: [ "events", "audit", "eventFixture" ] };
      const events: Thing = { name: "events", children: [ "optics" ] };
      const eventStore: Thing = { name: "eventStore", children: [ "events", "eventFixture" ] };
      const idValueStore: Thing = { name: "idValueStore", children: [ "utils", "audit" ] };
      const optics: Thing = { name: "optics", children: [ "utils" ] };
      const utils: Thing = { name: "utils", children: [] };
      const expected = [
        [ "utils" ],
        [  "events","optics" ],
        [ "audit", "eventFixture" ],//duplicated bug. The eventFuture is dependent on audit, and should be in a later generation
        [ "eventProcessor", "eventStore", "idValueStore" ],
        [ "api" ]
      ];
      const nodes = [ audit, api, eventFixture, eventProcessor, events, eventStore, idValueStore, optics, utils ];
      expect ( topologicalSort ( tc ) ( [  api,eventFixture,audit, eventProcessor, events, eventStore, idValueStore, optics, utils ] ).map ( gs => gs.map ( g => g.name ) ) ).toEqual ( expected )
      expect ( topologicalSort ( tc ) ( nodes.reverse () ).map ( gs => gs.map ( g => g.name ).reverse () ) ).toEqual ( expected )
    } )

  }
)