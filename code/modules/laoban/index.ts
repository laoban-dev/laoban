#!/usr/bin/env node
//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { makeStandardCli } from "./src/laoban";

import { makeCache } from "./src/configProcessor";
import { fileOpsNode } from "@laoban/filesops-node";
import { findVersionNumber } from "./src/Files";


try {
  makeStandardCli ( fileOpsNode(), makeCache, process.stdout, process.argv ).then ( cli => cli.start () ).then ( () => {
    process.setMaxListeners ( 30 ) // because commander adds many listeners: at least one per option, and we have more than 10 options
  } )
} catch ( e ) {
  console.error ( e.message )
}